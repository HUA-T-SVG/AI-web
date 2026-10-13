import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * 服务端专用模块不得被客户端代码引用。
 *
 * 这条约束原来只存在于注释里。`server/provider.ts` 读的是 LLM_API_KEY，
 * 一旦被客户端 import，密钥就有随 bundle 出门的风险 —— 而这正是
 * 「公开仓库不得包含任何密钥」那条规则最容易被绕过的地方：
 * 静态检查看不出来，`next build` 也不会报错，只有打开打包产物才会发现。
 */
const CLIENT_ROOTS = ['src/ui', 'src/app'];

/**
 * 服务端目录本身豁免：它当然要引用自己。
 *
 * Next 的 Route Handler（`app/api/**\/route.ts`）也豁免 —— **它本身就是服务端**，
 * 而它正是 `@/agent/server/*` 唯一合法的引用方。把它算进「客户端」会让
 * 这条测试要求服务端代码不许用服务端模块，把整件事反过来。
 */
const SERVER_ROOT = join('src', 'agent', 'server');
const ROUTE_HANDLERS = join('src', 'app', 'api');

function collectSourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return collectSourceFiles(path);
    return entry.name.endsWith('.ts') || entry.name.endsWith('.tsx') ? [path] : [];
  });
}

describe('agent 分层', () => {
  it('客户端代码不引用 agent/server/ 下的任何模块', () => {
    const offenders: string[] = [];
    for (const root of CLIENT_ROOTS) {
      for (const file of collectSourceFiles(root)) {
        if (file.startsWith(SERVER_ROOT) || file.startsWith(ROUTE_HANDLERS)) continue;
        const text = readFileSync(file, 'utf8');
        if (/@\/agent\/server\//.test(text)) offenders.push(file);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('这条检查确实扫到了文件 —— 否则它只是空转', () => {
    // 一条「永远找不到违规」的检查与一条「目录写错、扫了空集合」的检查
    // 在断言上完全一样。加一条自证：扫到的文件数必须是个像样的数目。
    const scanned = CLIENT_ROOTS.flatMap((root) =>
      collectSourceFiles(root).filter(
        (file) => !file.startsWith(SERVER_ROOT) && !file.startsWith(ROUTE_HANDLERS),
      ),
    );
    expect(scanned.length).toBeGreaterThan(10);
  });

  it('豁免目录确实存在 —— 目录改名后这条豁免不能悄悄失效', () => {
    // 豁免是「按路径前缀」写的。哪天 app/api 搬到别处，豁免还在、但什么也豁免不了；
    // 更糟的是反过来：有人以为豁免生效，其实路径写错了，于是服务端模块被误报为违规。
    expect(() => readdirSync(ROUTE_HANDLERS)).not.toThrow();
    expect(() => readdirSync(SERVER_ROOT)).not.toThrow();
  });
});
