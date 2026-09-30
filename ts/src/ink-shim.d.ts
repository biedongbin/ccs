/** ink 为纯 ESM 包；CJS 编译下用 ambient 声明过类型，运行时依赖 Node≥22 的 require(esm)。 */
declare module "ink" {
  import * as React from "react";
  export interface InkKey {
    upArrow: boolean; downArrow: boolean; leftArrow: boolean; rightArrow: boolean;
    pageDown: boolean; pageUp: boolean; return: boolean; escape: boolean;
    ctrl: boolean; shift: boolean; tab: boolean; backspace: boolean; delete: boolean;
    meta: boolean;
  }
  export function useInput(
    handler: (input: string, key: InkKey) => void,
    options?: { isActive?: boolean }): void;
  export function useStdout(): { stdout: NodeJS.WriteStream & { columns?: number; rows?: number }; stdin?: NodeJS.ReadStream };
  export function useStdin(): { stdin: NodeJS.ReadStream; isRawModeSupported: boolean; setRawMode: (m: boolean) => void };
  export const Box: React.FC<Record<string, unknown> & { children?: React.ReactNode }>;
  export const Text: React.FC<Record<string, unknown> & { children?: React.ReactNode }>;
  export function render(node: React.ReactNode, options?: { exitOnCtrlC?: boolean; stdout?: NodeJS.WriteStream }): { unmount: () => void; rerender: (n: React.ReactNode) => void; clear: () => void };
  export const Newline: React.FC<{ size?: number }>;
}
