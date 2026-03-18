declare module 'sql.js' {
    export interface Database {
        run(sql: string, params?: unknown[]): void;
        exec(sql: string): QueryExecResult[];
        prepare(sql: string): Statement;
        export(): Uint8Array;
        close(): void;
        getRowsModified(): number;
    }

    export interface Statement {
        bind(params?: unknown[]): boolean;
        step(): boolean;
        getAsObject(): Record<string, unknown>;
        free(): boolean;
        reset(): void;
    }

    export interface QueryExecResult {
        columns: string[];
        values: unknown[][];
    }

    export interface SqlJsStatic {
        Database: new (data?: ArrayLike<number> | Buffer | null) => Database;
    }

    export default function initSqlJs(config?: Record<string, unknown>): Promise<SqlJsStatic>;
}
