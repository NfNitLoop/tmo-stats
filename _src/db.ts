/**
 * Database functions for storing/fetching stats.
 * 
 */

import * as sqlite from "../deps/sqlite.ts"
import { DisposableStack } from "../deps/dispose.ts"
import * as gw from "./tmobile-gateway/tmobile-gateway.ts"

export class DB implements Disposable{
    static readonly CURRENT_VERSION = 1

    #conn: sqlite.DB

    private constructor(readonly filePath: string) {
        this.#conn = new sqlite.DB(filePath)
    }

    static openOrCreate(filePath: string): DB {
        const db = new DB(filePath)
        db.init()
        return db
    }

    /**
     * Perform DB initialization.
     */
    init() {
        const ver = this.#version()
        if (ver != null) {
            if (ver == DB.CURRENT_VERSION) {
                // already initialized.
                return
            }
            if (ver < DB.CURRENT_VERSION) {
                throw new Error(`DB needs to be upgraded from version ${ver} to ${DB.CURRENT_VERSION}`)
            }
            throw new Error(`DB is of a newer version (${ver}), than supported (${DB.CURRENT_VERSION})`)
        }

        const conn = this.#conn;
        conn.execute(`CREATE TABLE db_version(version INTEGER);`)
        conn.execute(`INSERT INTO db_version(version) VALUES(${DB.CURRENT_VERSION});`)
        
        conn.execute(`CREATE TABLE stats(timestamp_ms_utc INTEGER, stats_json TEXT)`)

    }

    saveSignal(stats: gw.SignalMap) {
        this.#conn.query("INSERT INTO stats(timestamp_ms_utc, stats_json) VALUES (:ts, json(:json))", {
            ts: Date.now(),
            json: JSON.stringify(stats)
        })
    }

    saveNote(note: string) {
        throw new Error("TODO")
    }

    #version(): number|null {
        if (!this.#table_exists("db_version")) {
            return null
        }
        const row = this.#queryOneOrNone<[number]>("select version from db_version");
        if (row == null) {
            return null
        }
        const version = row[0]
        
        if (typeof version != "number") {
            throw new Error(`Expected version to be a number, but got ${typeof version}`)
        }
        return version
    }

    /**
     * Make a query that expects exactly one row as result.
     */
    #queryOne<T extends unknown[]>(query: string, params?: sqlite.QueryParameterSet): T {
        const pq = this.#conn.prepareQuery<T>(query)
        using stack = new DisposableStack()
        stack.defer(() => pq.finalize())

        const rows = pq.iter(params)
        const firstRow = rows.next()
        if (firstRow.done) {
            throw new Error(`Expected exactly 1 result, but got 0 for: ${query}`)
        }
        const next = rows.next()
        if (!next.done) {
            throw new Error(`Expected exactly 1 result, but got many for: ${query}`)
        }

        return firstRow.value
    }

    #queryOneOrNone<T extends unknown[]>(query: string, params?: sqlite.QueryParameterSet): T|null {
        const pq = this.#conn.prepareQuery<T>(query)
        using stack = new DisposableStack()
        stack.defer(() => pq.finalize())

        const rows = pq.iter(params)
        const firstRow = rows.next()
        if (firstRow.done) {
            return null
        }
        const next = rows.next()
        if (!next.done) {
            throw new Error(`Expected exactly 1 result, but got many for: ${query}`)
        }

        return firstRow.value
    }

    #table_exists(name: string): boolean {
        const rows = this.#conn.query("SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name = :name", {name})
        return rows[0][0] == 1
    }

    check() {
        const sqliteVersion = this.#queryOne("select sqlite_version()")[0]
        console.log("SQLite Version:", sqliteVersion)

        const ver = this.#version()
        if (ver != DB.CURRENT_VERSION) {
            throw new Error(`Expected version ${DB.CURRENT_VERSION} but found ${ver}`)
        }
        console.log("Found version", ver)
    }

    close() {
        this.#conn.close()
    }

    [Symbol.dispose](): void {
        this.close()
    }
}