export declare function runPureOracle(): { readonly error?: Error; readonly status: number | null; readonly stdout: string; readonly stderr: string };
export declare function runNativeOracle(config?: string): { readonly error?: Error; readonly status: number | null; readonly stdout: string; readonly stderr: string };
export declare function runExportOracle(): { readonly error?: Error; readonly status: number | null; readonly stdout: string; readonly stderr: string };
