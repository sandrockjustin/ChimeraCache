# About ChimeraCache

ChimeraCache is an experimental package which aims to provide a configurable, easy-to-use caching solution for developers. As a package, ChimeraCache enables developers to quickly establish volatile caching with non-volatile fallback caching using the Node.js File System module. ChimeraCache monitors your system's performance, as well as its own performance as a process, to determine when fallback caching should activate. In the event that the non-volatile fallback does not meet your needs, you may prescribe your own custom fallback procedures to offload caching to a remote solution or another process of your choosing.

## Configuration

ChimeraCache aims to be highly configurable, and will update to include quality of life features recommended by the community. Below, you will find examples of all settings that you can configure so that ChimeraCache can meet the needs of your development team. Although the list is comprehensive, don't let it intimidate you! ChimeraCache does not require configuration in order to operate, as it will automatically load default settings that are optimized for local experimentation or small-scale applications.

### Overrides

The overrides section is where you can find basic configuration settings. ChimeraCache will preserve all configuration fields (and default values) that are not explicitly addressed when you instance and serve configurations to ChimeraCache. If this is impeding your development process, you may provide toggle `ignore_defaults` to `true` which will prevent ChimeraCache from preserving all default configurations. If this option is selected, please be aware that you are responsible for all required fields. Optional fields may be excluded in their entirety.

| Setting           | Values                                  | Description                                                                                                                             |
| ----------------- | --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `ignore_defaults` | `true` \| `false` _(default)_           | Completely wipes default config. Required when importing custom config. **Warning:** If configs are incomplete, ChimeraCache may crash. |
| `export_settings` | `true` _(default)_ \| `false`           | Exports your settings on startup to prevent data loss.                                                                                  |
| `parse_caches`    | `true` _(default)_ \| `false`           | Parses non-volatile cached data automatically. If disabled, returns raw JSON, which may cause Express.js errors if handled improperly.  |
| `dirname`         | `__dirname` _(default)_ \| _user input_ | Folder path for settings, logs, metrics, and non-volatile cache.                                                                        |

```js
/**
 * --BASIC EXAMPLE--
 */

const options = {
    overrides: {
      `ignore_defaults`: false,
      `export_settings`: true,
      `parse_caches`: true,
      `dirname`: `C:/myProj/server`
    }, //...and any other settings
  }
```

### Caching

| Setting    | Values                        | Description                                                                                                                                                               |
| ---------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `overflow` | `true` _(default)_ \| `false` | Enables hybrid caching with lightweight data stored in volatile memory and heavier data stored in non-volatile memory; this is performed separately from fallback policy. |

### Constraints - `byte_size`

| Subsetting | Values                          | Description                                                                                    |
| ---------- | ------------------------------- | ---------------------------------------------------------------------------------------------- |
| `enabled`  | `true` \| `false` _(default)_   | Enforces min/max byte bounds.                                                                  |
| `max`      | `0` _(default)_ \| _user input_ | Max size (bytes) for volatile cache. Larger items go to non-volatile if `overflow` is enabled. |
| `min`      | `0` _(default)_ \| _user input_ | Min size (bytes) required to enter volatile cache.                                             |

### Constraints - `byte_ratio`

| Subsetting | Values                        | Description                                              |
| ---------- | ----------------------------- | -------------------------------------------------------- |
| `enabled`  | `true` \| `false` _(default)_ | Enforces percent ratio of system memory.                 |
| `max`      | `0`–`0.99`                    | Max percent of system memory allowed for volatile cache. |
| `min`      | `0`–`0.99`                    | Min percent of system memory allowed.                    |

### Constraints - `limit`

| Subsetting | Values                                                                  | Description                                                      |
| ---------- | ----------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `enabled`  | `true` \| `false` _(default)_                                           | Enforces cache item quantity limits. Not affected by `overflow`. |
| `protocol` | `'engagement'` \| `'last_accessed'` \| `'created_at'` \| `'expires_at'` | Determines which field is used for item culling.                 |
| `max`      | `0` _(default)_ \| _user input_                                         | Max number of items allowed in cache.                            |

```js
/**
 * --BASIC EXAMPLE--
 * This configuration enforces bounds; when data wants to enter the volatile cache it may as long as it does not occupy more than 1% of system memory.
 * Because `overflow` is enabled, data that exceeds 1% of system memory will be cached in non-volatile storage.
 */
const options = {
  caching: {
    constraints: {
      overflow: true,
      byte_ratio: {
        enabled: true,
        max: 0.01,
        min: 0,
      },
    },
  },
};

/**
 * --LRU EXAMPLE--
 * This configuration disables `overflow` as well as `ttl` (time-to-live) to create a very basic LRU cache.
 * Under these settings, no more than (10) items will exist in the cache.
 * When culling occurs, survivors are chosen based on those recently accessed.
 */
const options = {
  caching: {
    constraints: {
      overflow: false,
      limit: {
        enabled: true,
        max: 10,
        protocol: "last_accessed",
      },
    },
  },
  ttl: {
    enabled: false,
  },
};
```

### TTL

ChimeraCache may enforce time-to-live (TTL) restrictions on cached items; the most basic settings that are required include `enabled` and `min`. ChimeraCache will always update items within its purview unless your fallback policy involves handoffs to external, backup caching solutions. If it meets the needs of your development team, you may also declare a `max` for time-to-live which will be used alongside the value of `extend_by`. As ChimeraCache updates items in the cache, it will extend their TTL by the value (ms) declared in `extend_by` each time that the item is accessed (up to the `max`).

| Setting     | Values                                 | Description                                                                                        |
| ----------- | -------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `enabled`   | `true` _(default)_ \| `false`          | Enables TTL for cache items.                                                                       |
| `min`       | `300000` _(ms)_ \| _user input_        | Min lifetime in milliseconds (without extensions).                                                 |
| `max`       | `600000` _(ms)_ \| _user input_        | Max lifetime in milliseconds(with extensions).                                                     |
| `extend_by` | `5000` _(default, ms)_ \| _user input_ | Milliseconds added on cache interaction. Will not exceed `max`. Default `max` enforced if missing. |

```js
/**
 * --BASIC EXAMPLE--
 * This configuration invalidates items in the cache when they have lived for longer than 300000ms (5min).
 */
const options = {
  ttl: {
    enabled: true,
    min: 300000,
  },
};

/**
 * --EXTENSION EXAMPLE--
 * This configuration also invalidates items in the cache when they have lived for longer than 300000ms (5min)...but only if they have not received extensions.
 * Every time that a user interacts with the cache, 1000ms (1s) are added to the TTL up to a maximum of 480000 (8min).
 * It would take 180 cache hits for the TTL to reach the maximum in this example.
 */
const options = {
  ttl: {
    enabled: true,
    min: 300000,
    max: 480000,
    extend_by: 1000,
  },
};
```

### Fallback

Fallback policies may be enabled or disabled depending on the needs of your team. The default fallback policy for ChimeraCache creates JSON files on the system; these files are parsed when they are fetched from the cache by default (`overrides: {'parse_caches': true}`). You may optionally disable this setting so that ChimeraCache returns unparsed (String) JSON to reduce some performance overhead, but this may require additional planning within your server architecture. A detailed explanation of fallback policies/protocols may be found below.

- `orphan`: Upon fallback activation, only peripheral data (timestamps, key names, filepaths) are kept in volatile memory. Cached data is sent to non-volatile storage in its entirety. The process never returns to volatile memory until restarted.
- `wayne`: Practically identical to the `orphan` protocol, with the exception that peripheral data is saved to a `manifest.json` on an interval. In the event of a system failure, the `manifest.json` can be loaded for a faster boot.
- `flex` _(default)_: Begins caching data to non-volatile storage when thresholds are exceeded, but it will routinely check to see if we can return to volatile storage entirely. If possible, it will execute this automatically.
- `foreign`: Upon fallback activation, executes foreign functions (user input). This is often used to fallback to another caching solution such as Redis. Hey, stuff happens, and we aren't ashamed to make this feature available.
- `foreign-flex`: This is a combination of `foreign` and `flex` protocols; items are stored and fetched with foreign functions.

| Setting    | Values                                                                               | Description                                                              |
| ---------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------ |
| `enabled`  | `true` _(default)_ \| `false`                                                        | Enables fallback to non-volatile memory.                                 |
| `protocol` | `'orphan'` \| `'wayne'` \| `'flex'` _(default)_ \| `'foreign'` \| `'foreign-flex'`\| | The protocol/policy that should activate when thresholds are reached.    |
| `grace`    | `15000` _(default, ms)_ \| _user input_                                              | Grace period before fallback activation. Gives system time to stabilize. |

### Threshold - System

| Subsetting | Values     | Description                                        |
| ---------- | ---------- | -------------------------------------------------- |
| `max`      | `0`–`0.99` | Max % system memory usage before fallback.         |
| `min`      | `0`–`0.99` | Min % system memory usage to begin fallback check. |

### Threshold - Process

| Subsetting | Values     | Description                                      |
| ---------- | ---------- | ------------------------------------------------ |
| `max`      | `0`–`0.99` | Max % heap memory usage (process-level).         |
| `min`      | `0`–`0.99` | Min % heap memory usage to begin fallback check. |
