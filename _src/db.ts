/**
 * Database functions for storing/fetching stats.
 * 
 */

import * as sqlite from "../deps/sqlite.ts"

export class DB {
    #conn: sqlite.DB

    private constructor(readonly filePath: string) {
        this.#conn = new sqlite.DB(filePath)
    }

    static openOrCreate(filePath: string) {
        return new DB(filePath)
    }

    close() {
        this.#conn.close()
    }
}