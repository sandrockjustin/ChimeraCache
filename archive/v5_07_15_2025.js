const fs = require('node:fs/promises');
const path = require('node:path');

class ChimeraCache {

  #logging = {
    console: false,
    files: {
      errors: true,
      generic: false
    }
  };
  #path = path.resolve();
  #ttl = 300000;
  #interval = 60000;
  #cache = {};
  #subroutine;

  /**
   * @typedef {Object} CacheOptions
   * @property {string} [path] - Path to the storage directory.
   * @property {number} [ttl] - Time-to-live for cache entries (in ms).
   * @property {number} [interval] - Interval for cleanup operations (in ms).
   * @property {boolean} [logging] - Enable console.log() for each operation as they occur.
   */

  /**
   * Creates a new cache instance.
   * @param {CacheOptions} options - Configuration options for the cache.
   */
  constructor(options = {}) {

    const {path = null, ttl = null, interval = null, logging = null} = options;

    if (interval) { this.#interval = interval};
    if (path) { this.#path = path};
    if (ttl) {this.#ttl = ttl};
    if (logging) { this.#logging = logging };

    this.#init();
  }

  async #log(i, msg) {
    const chars = ['×', '✓', '→'];
    const now = new Date();

    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const formattedDate = `${year}-${month}-${day}`;


    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    const formattedTime = `${hours}-${minutes}-${seconds}`;
    const line = `${formattedDate}-${formattedTime} ${chars[i]} ${msg}\n`;

    if (this.#logging.console) {
      console.log(line.trim());
    }

    try {
      if (this.#logging.files.generic) {
        await fs.appendFile(`${this.#path}/cache/logs/${formattedDate}_generic.txt`, line);
      }

      if (this.#logging.files.errors && i === 0) {
        await fs.appendFile(`${this.#path}/cache/logs/${formattedDate}_errors.txt`, line);
      }
    } catch (err) {
      
    }
  }


  /**
   * Initializes the directories for caching; begins TTL subroutines.
   * @returns 
   */
  async #init() {
    try {

      // create directories for storage
      await fs.mkdir(`${this.#path}/cache/storage`, {recursive: true}); // recreate storage
      await fs.mkdir(`${this.#path}/cache/logs`, {recursive: true}); // create a place for storing error logs
      this.#log(2, `ChimeraCache Lite workspace initialized at '${this.#path}'.`)

      // create a TTL subroutine for invalidation
      this.#subroutine = setInterval(() => {
        this.#log(2, `TTL invalidation subroutine will now review items.`)
        for (const entry in this.#cache) {
          if (this.#cache[entry].expiresAt <= Date.now()) {
            this.invalidate(entry);
          }
        }
      }, this.#interval); 

    } catch (error) {
      this.#log(0, error.message);
      return error;
    }
  }

  #sanitize(entry) {
    return entry.replace(/[<>:"/\\|?*\x00-\x1F]/g, '_').replace(/[\s.]+$/g, ''); 
  }


  /**
   * Tells this request to wait for a pending item to finish being created; returns parsed JSON data (object) when fulfilled.
   * @param {*} entry - The "key" for searching within storage in VM Cache.
   * @returns undefined
   */
  async #wait(entry) {
    try {
      let resolved;
      if (this.#cache.hasOwnProperty(entry) && this.#cache[entry].pending) {
        this.#log(2, `Instructed to wait for '${entry}' to resolve in cache.`);

        const wait = setInterval(() => {
          if (!this.#cache[entry].pending) {
            this.#log(1, `Successful wait for '${entry}'; sending GET request to ChimeraCache Lite.`);
            clearInterval(wait);
            this.get(entry).then((data) => resolved = data);
          } else if (!this.#cache[entry]) {
            this.#log(0, `Error during wait for '${entry}; sending GET request to ChimeraCache Lite.'`);
            clearInterval(wait);
            this.get(entry).then((data) => resolved = data);
          } else {
            this.#log(2, `Entry '${entry}' has not resolved in 2000ms, repeat retrieval attempt.`);
          }
        }, 2000)

      } else {
        this.#log(1, `Instructed to wait, but entry '${entry}' has resolved in cache. Sending GET request to ChimeraCache Lite.`);
        resolved = this.get(entry);
        return resolved;
      }

    } catch(error) {
      this.#log(0, error.message);
      return error;
    }
  }


  /**
   * Removes indicated entry from VM Cache and NVM. 
   * @param {*} entry - The "key" indicating which file and entry should be removed from cache. Automatically sanitized.
   * @returns undefined
   */
  async invalidate(entry) {
    try {
      const key = this.#sanitize(entry);
      await fs.rm(`${this.#path}/cache/storage/${key}.json`, { recursive: true, force: true });
      this.#log(1, `Entry '${entry}' has been removed from VM/NVM.`);
      delete this.#cache[key];
    } catch (error) {
      this.#log(0, error.message);
      return error;
    }
  }

  /**
   * 
   * @param {*} entry - The "key" to search for in VM Cache and NVM storage.
   * @param {*} callback - Optional callback to execute if item does not exist in VM Cache.
   * @param {*} args - If callback supplied and requires arguments, supply an array of arguments.
   * @returns Data that has been parsed from JSON (object).
   */
  async get(entry, callback, args = []) {
    try {

      const key = this.#sanitize(entry);

      // If the item exists in the Cache and is not pending
      if (this.#cache[key] && !this.#cache[key].pending) {

        // read from file
        const fileContents = await fs.readFile(`${this.#path}/cache/storage/${key}.json`);

        // return the file contents
        if (fileContents) {
          this.#log(1, `Success on GET request for '${entry}'.`);
          return JSON.parse(fileContents);

        // else start a call to fetch this item from database with our callback and arguments;
        } else if (callback && args) {
          this.#log(2, `Initiating foreign callback with arguments ${args.join(', ')} for entry '${entry}'.`);
          this.get(key, callback, args);
        }

      // if the item is already being cached, do not double-up on requests, and wait instead
      } else if (this.#cache.hasOwnProperty(key) && this.#cache[key].pending) {

        await this.#wait(key);

      // if this item is not already set, and we have been provided with callback and args, go ahead and set
      } else if (!this.#cache.hasOwnProperty(key) && callback && args) {

        this.#log(2, `No entry found for '${entry}', creating new entry with pending flag.`);
        // initialize a new item as pending
        this.#cache[key] = new CacheEntry({
          pending: true,
          ttl: this.#ttl
        });

        // wait for callback fulfillment
        this.#log(2, `Initiating foreign callback with arguments ${args.join(', ')} for entry '${entry}'.`);
        const data = await callback(...args);

        if (data) {
          this.#cache[key].pending = false;
          await this.set(key, data);
          return data;
        } else {
          this.#log(0, `Foreign callback failure for query '${key}', could not successfully fetch.`);
          return null;
        }

      }

    } catch (error) {
      this.#log(0, error.message);
      return error;
    }
  }

  /**
   * Receives an entry (key) and data. Creates a new CacheEntry within VM Cache, offloads data to NVM as JSON.
   * @param {*} entry - The "key" to be used for filename and storage in VM Cache. Automatically sanitized.
   * @param {*} data - The data to be stringified as JSON; must be a valid JSON.
   * @returns null | Error
   */
  async set(entry, data) {
    try {
      const key = this.#sanitize(entry);

      if (this.#cache.hasOwnProperty(key) && this.#cache[key.pending]) {
        const resolved = await this.#wait(key);
        return resolved;
      }

      // this accounts for an external set, if you don't wish to use get() callback option
      if (!this.#cache.hasOwnProperty(key)) {
        // initialize a new item as pending
        this.#log(2, `No entry found for '${entry}', creating new entry with pending flag.`);
        this.#cache[key] = new CacheEntry({
          pending: true,
          ttl: this.#ttl
        });
        
        await fs.writeFile(`${this.#path}/cache/storage/${key}.json`, JSON.stringify(data));
        this.#log(1, `Successfully created NVM cache for entry '${entry}'.`);

        this.#cache[key].pending = false;
        this.#log(1, `Entry ${entry} is no longer pending; flag lowered.`);
      }

      return null;
    } catch (error) {
      this.#log(0, error.message);
      return error;
    }
  }

}

class CacheEntry {

  pending = false;
  createdAt = Date.now();
  expiresAt = Date.now();

  constructor(options = {}) {
    const {pending = null, ttl = null} = options;
    this.pending = pending ? pending : false;
    this.createdAt = Date.now();
    this.expiresAt = Date.now() + ttl;
  }
}

module.exports = ChimeraCache;



