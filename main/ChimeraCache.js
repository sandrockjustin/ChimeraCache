const merger = require('./deps/utils/merger');
const sanitize = require('./deps/utils/sanitize');
const path = require('node:path');
const Enforcer = require('./deps/architecture/enforcer');

class ChimeraCache {

  #version = `ChimeraCache v6`;
  #config;
  #CCENF;


  constructor(config = null, foreign = null) {
    this.#init(config, foreign);
    this.#CCENF = new Enforcer(this.#config);
  }

  #init(config = null, foreign = null) {

    if (config && config.overrides && config.overrides.ignore_defaults) {
      this.#config = config;

      if (foreign) {
        this.#config.foreign = {
          enabled: foreign.enabled,
          cache: [],
          get: foreign.get,
          set: foreign.set
        };
      } else {
        this.#config.foreign = {
          enabled: false,
          cache: null,
          get: null,
          set: null
        };
      }

      return; 
    }

    this.#config = {overrides: {}, caching: {}, ttl: {}, fallback: {}};

    const overrides = {
      path: path.resolve(),
      ignore_defaults: true,
      parsing: true,
      manifest: false
    }

    const caching = {
      overflow: true,
      bytes: {
        size: {
          enabled: false,
          max: 0,
          min: 0
        },
        ratio: {
          enabled: true,
          max: 0,
          min: 0
        }
      },
      limit: {
        enabled: false,
        protocol: null,
        max: 0,
        min: 0
      }
    }

    const ttl = {
      enabled: true,
      extend_by: 0,
      interval: 0,
      max: 0,
      min: 0
    }

    const fallback = {
      enabled: true,
      manifest: false,
      thresholds: {
        system: {
          enabled: true,
          max: 0.85,
          min: 0.7
        },
        process: {
          enabled: true,
          max: 0.8,
          min: 0.6
        },
        chimera: {
          system: {
            enabled: true,
            max: 0.75,
            min: 0.5
          },
          process: {
            enabled: false,
            max: 0,
            min: 0
          }
        }
      },
      monitoring: {
        duration: 30000,
        samples: 5,
        delay: 30000
      }
    };

    this.#config = {overrides, caching, ttl, fallback};

    if (config) {
      const merged = merger(this.#config, config);
      this.#config = merged;
    }

    if (foreign) {
      this.#config.foreign = {
        enabled: foreign.enabled,
        cache: [],
        get: foreign.get,
        set: foreign.set
      };
    } else {
      this.#config.foreign = {
        enabled: false,
        cache: null,
        get: null,
        set: null
      };
    }

    return;
  }

  async get(entry) {
    try {
      const response = await this.#CCENF.get(sanitize(entry));
      return response;
    } catch (error) {
      console.error(error);
      return error;
    }
  }

  async set(entry, data) {
    try {
      await this.#CCENF.set(sanitize(entry), data);
      return null;
    } catch (error) {
      console.error(error);
      return error;
    }
  }
}

module.exports = ChimeraCache;