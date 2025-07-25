const Oracle = require('./oracle');

/**
 * Instances a new Interrogator. The Interrogator (Auditor) architecture is responsible for conducting 
 * investigations upon request from the Enforcer. It is primarily responsible for requesting system diagnostics
 * during the caching process; it reports these to the Enforcer architecture during an audit(). However, the
 * Interrogator also provides vital assistance by evaluating caching constraint violations.
 */
class Interrogator {

  #CCORC;
  #caching;
  #fallback;
  #activated = false;
  #pending = false;

  constructor(options = {}) {
    const {caching = null, fallback = null} = options;
    const monitoring = fallback.monitoring;

    this.#CCORC = new Oracle(monitoring);
    
    if (caching) this.#caching = caching;
    if (fallback) this.#fallback = fallback; // intended to be an object containing [system, process, chimera] objects as well as a protocol object {policy (native overrides like Orphan/Wayne/Foreign/Flex), recover (true/false), interval, delay}
  }

  async free(bytes) {
    try {
      this.#CCORC.free(bytes);
    } catch (error) {
      console.error(error);
      return error;
    }
  }

  async audit() {
    return {
      activated: this.#activated,
      pending: this.#pending
    }
  }

  async interrogate(options = {}) {

    try {
      
      await this.#diagnostics();                            // before we add anything, check performance
      const {cache, invalidate, enforce_limits} = options;
      const baseline = process.memoryUsage().heapUsed;
  
      cache();
  
      const report = await this.#CCORC.audit({baseline, caching: this.#caching});

      if (!report.overflow && !report.underflow) {

        await enforce_limits();
        this.#CCORC.allocate(report.bytes);
        return report.bytes;                  // we return this for Enforcer to update Cache item with in VM
      
      } else if (report.overflow && !this.#caching.overflow) {           
        invalidate();
        return false;        
      } else if (report.overflow) {           // this comes before report.underflow, because if overflow AND underflow detected then overflow has higher priority and always will

        await enforce_limits();
        invalidate();
        return true;                          // return true to indicate that Enforcer must handle an overflow
        
      } else if (report.underflow) {
        invalidate();                         // if underflow, invalidate(), because if a developer doesn't care about underflow it is set to 0
        return false;
      }

    } catch (error) {
      console.error(error);
      return error;
    }

  }

  async #diagnostics() {

    try {
      const tearline_report = await this.#CCORC.performance_monitoring(true);
      const {system = null, process = null, chimera = null} = this.#fallback.thresholds;

      /**
       * If this item is pending, we return false to say that we should keep going as normal. If the diagnostics
       * activate fallback policy, then this will be overridden anyway. Also, when we enter a recovery state,
       * the tiered conditionals here will naturally de-escalate responses without additional conditionals.
       * 
       * The Enforcer architecture will naturally check to see if fallbacks are active, and if the fallback is
       * not active it will begin slowly recovering fallback data into volatile memory. The Enforcer architecture
       * will create a setTimeout() upon noticing that these diagnostics have returned false, and that the Enforcer
       * has a conflicting internal state of active. After the setTimeout(), diagnostics will execute again. If
       * the diagnostics return all clear, we begin recovering.
       */
      if (this.#pending || !tearline_report) return false;


      const major_violation = (system.enabled && (tearline_report.system.usage >= system.max)) ||
        (process.enabled && (tearline_report.process.system_usage >= process.max)) ||
        ((chimera.system && chimera.system.enabled) && (tearline_report.chimera.system_usage >= chimera.system.max)) ||
        ((chimera.process && chimera.process.enabled) && (tearline_report.chimera.process_usage >= chimera.process.max));

      // if we are at or beyond max, signal immediately that we must activate and enforce fallback policy.
      if (major_violation) {
        this.#activated = true;
        return true;
      }

      const minor_violation = (system.enabled && (tearline_report.system.usage >= system.min)) ||
        (process.enabled && (tearline_report.process.system_usage >= process.min)) ||
        ((chimera.system && chimera.system.enabled) && (tearline_report.chimera.system_usage >= chimera.system.min)) ||
        ((chimera.process && chimera.process.enabled) && (tearline_report.chimera.process_usage >= chimera.process.min));

      if (minor_violation) {
        console.log(tearline_report);

        this.#pending = true;
        const start = Date.now();
        const comprehensive_report = await this.#CCORC.performance_monitoring(false);
        const {system = null, process = null, chimera = null} = this.#fallback.thresholds;

        if (!comprehensive_report) {
          throw new Error(`Failed to generate a performance report in #CCORC.`);
        }

        const persistent_violation = (system.enabled && (comprehensive_report.system.usage >= system.min)) ||
        (process.enabled && (comprehensive_report.process.system_usage >= process.min)) ||
        ((chimera.system && chimera.system.enabled) && (comprehensive_report.chimera.system_usage >= chimera.system.min)) ||
        ((chimera.process && chimera.process.enabled) && (comprehensive_report.chimera.process_usage >= chimera.process.min));

        if (persistent_violation) {
          this.#activated = true;
          this.#pending = false;
          return true;
        } else {
          this.#pending = false;
          return false;
        }
      }

      return false;
      
    } catch (error) {
      console.error(error);
      return error;
    }

  }

}

module.exports = Interrogator;