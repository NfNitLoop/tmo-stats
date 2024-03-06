/**
 * Database functions for storing/fetching stats.
 * 
 */

import * as sqlite from "../deps/sqlite.ts"
import { DisposableStack } from "../deps/dispose.ts"
import * as gw from "./tmobile-gateway/tmobile-gateway.ts"
import {default as od} from "https://deno.land/x/outdent@v0.8.0/mod.ts";
import * as st from "./test_speed/ookla.ts"


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
        
        conn.execute(od`
            CREATE TABLE stats(
                timestamp_ms_utc INTEGER NOT NULL PRIMARY KEY
                , stats_json TEXT
            )
        `)

        conn.execute(od`
            CREATE VIEW stats_bands AS
            SELECT
                timestamp_ms_utc,
                datetime(timestamp_ms_utc / 1000.0, 'unixepoch', 'localtime') AS local_time,
                datetime(timestamp_ms_utc / 1000.0, 'unixepoch') AS utc_time,
                '4g' as g,
                band_4g.value as band,
                (stats_json ->> '$.4g.bars') as bars,
                (stats_json ->> '$.4g.sinr') as sinr,
                (stats_json ->> '$.4g.rsrq') as rsrq,
                (stats_json ->> '$.4g.rsrp') as rsrp,
                (stats_json ->> '$.4g.rssi') as rssi
            FROM 
                stats AS s4
                JOIN json_each(s4.stats_json, '$.4g.bands') AS band_4g
            UNION 
            SELECT
                timestamp_ms_utc,
                datetime(timestamp_ms_utc / 1000.0, 'unixepoch', 'localtime') AS local_time,
                datetime(timestamp_ms_utc / 1000.0, 'unixepoch') AS utc_time,
                '5g' as g,
                band_5g.value as band,
                (stats_json ->> '$.5g.bars') as bars,
                (stats_json ->> '$.5g.sinr') as sinr,
                (stats_json ->> '$.5g.rsrq') as rsrq,
                (stats_json ->> '$.5g.rsrp') as rsrp,
                (stats_json ->> '$.5g.rssi') as rssi
            FROM 
                stats AS s5
                JOIN json_each(s5.stats_json, '$.5g.bands') AS band_5g
        `)

        conn.execute(od`
            CREATE TABLE speedtest (
                started_ms_utc INTEGER NOT NULL PRIMARY KEY,
                finished_ms_utc INTEGER NOT NULL,
                data_json TEXT NOT NULL,
                upload INTEGER NOT NULL, -- bandwidth in bytes per second
                download INTEGER NOT NULL -- bandwidth in bytes per second
            );
        `)
    }

    saveSignal(stats: gw.SignalMap) {
        this.#conn.query("INSERT INTO stats(timestamp_ms_utc, stats_json) VALUES (:ts, json(:json))", {
            ts: Date.now(),
            json: JSON.stringify(stats)
        })
    }

    saveSpeedTest(args: SaveSpeedTestArgs) {
        const {started, finished, data} = args
        this.#conn.query(
            od`
                INSERT INTO speedtest(
                    started_ms_utc, finished_ms_utc, data_json, upload, download
                ) VALUES(:started, :finished, json(:json), :upload, :download)
            `, 
            {
                started, finished,
                json: JSON.stringify(data),
                upload: data.upload.bandwidth,
                download: data.download.bandwidth,
            }
        )

    }

    getStats(args: GetStatsArgs): Promise<StatsRow[]> {
        throw new Error("TODO")
    }

    getLastStats(count: number): StatsRow[] {
        const rows = this.#conn.queryEntries<StatsRow>(
            `
                SELECT 
                    timestamp_ms_utc AS ts
                    , g 
                    , bars
                    , sinr
                    , rsrq
                    , rsrp
                    , rssi
                FROM stats_bands
                ORDER BY timestamp_ms_utc DESC
                LIMIT :limit
            `,
            {limit: count}
        )
        return rows
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

export type GetStatsArgs = {
    // UTC timestamp in ms
    startAt: number
    endAt: number
}

export type StatsRow = {
    // UTC ms
    ts: number

    g: "4g"|"5g"

    bars: number
    sinr: number
    rsrq: number
    rsrp: number
    rssi: number
}

export type SaveSpeedTestArgs = {
    data: st.TestResult,
    started: number,
    finished: number,
}