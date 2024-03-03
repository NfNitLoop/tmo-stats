/**
 * Broken. Doesn't seem to work in Deno.
 */

import { default as CFSpeedTest, ConfigOptions } from "npm:@cloudflare/speedtest@1.3.0"

async function main() {
    const opts: ConfigOptions = {
    }
    const test = new CFSpeedTest(opts)
    test.onFinish = (results) => {
        console.log(results)
    }
}

if (import.meta.main) {
    await main()
}