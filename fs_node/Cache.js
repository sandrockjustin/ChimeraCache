const fs = require('fs/promises');
const path = require('path')

class Cache {

	/**
	 * Creates a new Cache and manifest. Immediately begins executing cache invalidation subroutines, and makes other utilities available to your server.
	 *
	 * @param {number} milliseconds - The time (in milliseconds) that cache invalidation subroutines and manifest preservation should occur on an interval.
	 * @param {number} constraints - The time (in milliseconds) that it takes for a cached item to expire.
	 * @param {string} manifest - A record of each query (and its respective data) that has been saved; includes the original date that the data was cached. Optionally, you may provide a manifest override.
	 * @param {object} dirname - An optional path configuration for your cache to be created.
	 * @returns {object} A new cache; immediately begins executing subroutines for cache invalidation.
	 */
	constructor(milliseconds = 900000, constraints = 900000, manifest = null, dirname = null){
		this.manifest = manifest ? manifest : {"createdAt": new Date()};
		this.path = dirname ? dirname : path.resolve();
		this.subroutine = null;
		this.init().then(() => {
			if (milliseconds === 900000 && constraints === 900000) {
				console.log(`→ Starting cache invalidation subroutines with DEFAULT parameters (15 minutes).`)
			} else {
				console.log(`→ Starting cache invalidation subroutines with CUSTOM parameters (${milliseconds}ms, ${constraints}ms).`)
			}
			this.startSubroutines(milliseconds, constraints);
		})
	}

	/**
	 * Initializes a manifest if one is not found; the cache manifest is used to preserve search queries and their expiration timer. This function also initializes the cache storage and workspace.
	 *
	 * @returns {object} A parsed manifest reflecting saved queries and their creation date.
	 */	
	async init(){
		try {
			
			const manifest = await fs.readFile(`${this.path}/cache/manifest.json`);

			this.manifest = JSON.parse(manifest);

			console.log(`✓ Successful retrieval of cache manifest from '${this.path}/cache/manifest.json'.`)

			await fs.mkdir(`${this.path}/cache/storage`, {recursive: true});

			return this.manifest;

		} catch (error) {
			console.error(`× Error retrieving manifest from cache; initializing new manifest '${this.path}/cache/manifest.json'.`)

			if (error.message.includes("ENOENT: no such file or directory, open")) {
				fs.mkdir(`${this.path}/cache/storage`, {recursive: true});
				fs.writeFile(`${this.path}/cache/manifest.json`, JSON.stringify(this.manifest));
				console.log(`✓ Successful recovery; initialization of new cache manifest completed.`)
			} else {
				console.error(`× FATAL ERROR :: Failed to initialize manifest.\n`, error);
			}
		}
	}

	/**
	 * Starts a cache invalidation subroutine that checks every x (milliseconds) if the cache has existed at or beyond y (time constraint). If an item has expired, the file is deleted and removed from the cache manifest. At the end of each interval, the manifest is saved to non-volatile memory.
	 *
	 * @param {number} milliseconds - The frequency at which you would like for the manifest to be saved to non-volatile memory, as well as the frequency of each subroutine interval.
	 * @param {number} constraint - The bounds (in milliseconds) that is used to determine when a cached item should be deleted. If not defined, constraint is set equal to milliseconds.
	 */
	async startSubroutines(milliseconds, constraint = milliseconds){
		try {

			for (const query in this.manifest) {

				if (this.manifest[query] + constraint <= Date.now()) {
					await fs.rm(`${this.path}/cache/storage/${query}.json`, { recursive: true, force: true });
					delete this.manifest[query];
					console.log(`→ Invalidated query ${query}.`);
				}

			}			
			
			await fs.writeFile(`${this.path}/cache/manifest.json`, JSON.stringify(this.manifest));

			console.log(`✓ Manifest saved to non-volatile memory; cache invalidation subroutines complete.`);

			if (this.subroutine === null) {
				this.subroutine = setInterval(() => {
					this.startSubroutines(milliseconds, constraint)
				}, milliseconds);
			}

		} catch (error) {
			console.error(`× Error during subroutines; error message follows.\n`, error);
		}
	}
	
	/**
	 * Stops ongoing cache invalidation subroutine.
	 */
	stopSubroutines() {
		if (this.subroutine) {
			clearInterval(this.subroutine);
			this.subroutine = null;
		}
	}

	/**
	 * Creates a new item in the cache, and records the date of its creation to the cache manifest. This is intended to be used if you would rather not pass in a callback to the Cache.fetch() method.
	 *
	 * @param {string} query - The query that you would like to store in the cache.
	 * @param {object} data - The data that you want to be stored in the cache. Must be convertable to JSON.
	 * @returns {object} A parsed object for fulfilling server GET requests.
	 */
	async create(query, data) {
		try {
			
			const toJSON = JSON.stringify(data);	

			await fs.writeFile(`${this.path}/cache/storage/${query}.json`, toJSON);

			this.manifest[query] = Date.now();

			console.log(`→ Cached query '${query}'.`)

			return data;
			
		} catch (error) {
			console.error(`× Caching failed for query '${query} at ${new Date()}.\n`, error);
			return error;
		}
	}

	/**
	 * Searches local cache for a file sharing the same name as your query. Optionally creates a file, if provided with a callback that returns data.
	 *
	 * @param {string} query - The query that you are searching for in the cache.
	 * @param {boolean} refresh - Should we refresh this cache's lifespan?
	 * @param {function} callback - The callback function to execute if the item is not found in your cache. This function should execute a database pull and return it.
	 * @param {array} arguments - An array of arguments to pass off to your callback, if necessary.
	 * @returns {object|null} A parsed object for fulfilling server GET requests, or null if not found.
	 */
	async fetch(query, refresh = false, cb = null, cbArgs = []) {
		try {

			const data = await fs.readFile(`${this.path}/cache/storage/${query}.json`);

			if (refresh && data) {

				this.manifest[query] = Date.now();
				console.log(`→ Extended lifespan for query '${query}'.`);
				return JSON.parse(data);

			} else if (data) {
				return JSON.parse(data);
			}

		} catch (error) {

			console.error(`× Error fulfilling fetch of query ${query} from cache.`);

			if (cb) {
				console.log(`→ Executing callback function for a database pull.`);
				const dbPull = cb(...cbArgs);

				if (dbPull) {
					this.create(query, dbPull);
					console.log(`✓ Successful callback execution; cached query '${query}'.`);
					return dbPull;
				} else {
					console.error(`× Failure in callback execution for query '${query}'; the provided callback follows:`, cb);
					return error;
				}
			}

			return null;
		}
	}

}


export default Cache;



