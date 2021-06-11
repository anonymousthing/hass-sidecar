import websocketConnection from "./websocketConnection"
import { IState, IStateCallback } from "../interfaces/IState"
import path from 'path';
import chokidar from 'chokidar'
import fetch from 'node-fetch';
import { Automation } from "../interfaces/Automation";

import findAutomations from './findAutomations'
import Logger from './Logger';

/**
 * Class to manage all interactions with the backend
 *
 * @class API
 */
class API {
  private host = process.env.HA_HOST || ''
  private token = process.env.HA_TOKEN || '';

  private _automations: Map<string, Automation> = new Map()
  private _connection: websocketConnection
  private _states: Map<string, IState> = new Map()
  private _stateListeners: Map<string, { id: number, callback: IStateCallback }[]> = new Map()
  private _automationListeners: Map<string, { id: number, callback: () => void }[]> = new Map()

  private static _instance: API

  /**
   * Creates an instance of API.
   *
   * @memberof API
   */
  public constructor() {
    // Initiate the websocket connection
    this._connection = new websocketConnection(this.host, this.token)

    // When the connection is ready, sync all states
    this._connection.addEventListener('ready', () => {
      Logger.info('Connection ready')

      this._syncStates()
        .then(() => {
          Logger.info('States synced')

          // Loading all automations when states are synced
          this._bootstrap()
        })
        .catch((error) => {
          Logger.error(error)
        })

      // Main function to watch states changes
      this._onStateChange()
      // Watch for automation triggers
      this._onAutomationTrigger()
    })

    // If connection closes, unload all automations
    this._connection.onClose(() => {
      this._unload()
    })
  }

  /**
   * Singleton
   *
   * @static
   * @returns {API} Instance
   * @memberof API
   */
  public static getInstance(): API {
    if (!API._instance) {
      API._instance = new API()
    }

    return API._instance
  }

  /**
   * Subscribe to state changes on entity
   *
   * @param {string} entityId              entity_id to watch for changes
   * @param {IStateCallback} callback      callback function
   * @returns                listenerInfo  Object with the listener information
   * @memberof API
   */
  public onState(entityId: string, callback: IStateCallback) {
    const id = Math.floor(Math.random() * 10000) + new Date().getTime()
    const listenerInfo = {
      id,
      entityId
    }

    // Store this callback to the _stateListeners map
    if (!this._stateListeners.has(entityId)) {
      this._stateListeners.set(entityId, [{ id, callback }])
    } else {
      const listeners = this._stateListeners.get(entityId)
      if (listeners) {
        listeners.push({
          id,
          callback
        })
        this._stateListeners.set(entityId, listeners)
      }
    }
    return listenerInfo
  }

  /**
   * Subscribe to automation trigger events
   *
   * @param {string} entityId              entity_id of automation to watch for trigger event
   * @param {() => void)} callback      callback function
   * @returns                listenerInfo  Object with the listener information
   * @memberof API
   */
  public onAutomation(entityId: string, callback: () => void) {
    const id = Math.floor(Math.random() * 10000) + new Date().getTime()
    const listenerInfo = {
      id,
      entityId
    }

    // Store this callback to the _automationListeners map
    if (!this._automationListeners.has(entityId)) {
      this._automationListeners.set(entityId, [{ id, callback }])
    } else {
      const listeners = this._automationListeners.get(entityId)
      if (listeners) {
        listeners.push({
          id,
          callback
        })
        this._automationListeners.set(entityId, listeners)
      }
    }
    return listenerInfo
  }

  /**
   * Unsubscribe from state change.
   *
   * @param {string} entityId   entity to unsubscribe
   * @param {number} id         id subscription
   * @memberof API
   */
  public clearOnState(entityId: string, id: number) {
    if (this._stateListeners.has(entityId)) {
      let listeners = this._stateListeners.get(entityId)
      if (listeners) {
        listeners = listeners.filter(l => l.id !== id)
        if (listeners.length === 0) {
          this._stateListeners.delete(entityId)
          return
        }
        this._stateListeners.set(entityId, listeners)
      }
    }
  }

  /**
   * Unsubscribe from automation trigger.
   *
   * @param {string} entityId   entity to unsubscribe
   * @param {number} id         id subscription
   * @memberof API
   */
  public clearOnAutomation(entityId: string, id: number) {
    if (this._automationListeners.has(entityId)) {
      let listeners = this._automationListeners.get(entityId)
      if (listeners) {
        listeners = listeners.filter(l => l.id !== id)
        if (listeners.length === 0) {
          this._automationListeners.delete(entityId)
          return
        }
        this._automationListeners.set(entityId, listeners)
      }
    }
  }

  /**
   * Get current state of one entity
   *
   * @param {string} entityId      entity_id to get state
   * @returns {Promise<IState>}    Promise qith the state
   * @memberof API
   */
  public async getState(entityId: string): Promise<IState> {
    const state = this._states.get(entityId)
    if (!state) {
      throw new Error(`${entityId} state not available`)
    }
    return state
  }

  public async setState(entityId: string, state: Partial<IState> & Pick<IState, 'state'>) {
    const resp = await fetch(`https://${this.host}/api/states/${entityId}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(state),
    });
    if (!resp.ok) {
      throw new Error(`Error when setting state for entity ${entityId} - ${resp.status} ${resp.statusText}`);
    }
  }

  /**
   * Search entities based on a RegExp or string
   * @param filter String or RegExp to search for
   * @returns IState[] Array of states
   */
  public async searchEntities(filter: RegExp | string): Promise<IState[]> {
    const states: IState[] = []
    const exp = typeof filter === 'string' ? new RegExp(filter) : filter

    this._states.forEach((ent) => {
      if (exp.test(ent.entity_id)) {
        states.push(ent)
      }
    })
    return states
  }

  /**
   * Call a Home Assistant service
   *
   * @param {string} domain              Domain, for example: light
   * @param {string} service             Service, for example: turn_on
   * @param {(string | null)} entityId   Entity id
   * @param {*} data                     Attributes (optional)
   * @returns {Promise<any>}             Promise with the result
   * @memberof API
   */
  public callService(domain: string, service: string, entityId: string | null, data: any): Promise<any> {
    return new Promise((resolve, reject) => {
      let options: any = {
        entity_id: entityId
      }

      // Merging options
      if (data && data !== {}) {
        options = { ...options, ...data }
      }

      // Some services don't require an entity_id
      if (!entityId) {
        delete options.entity_id
      }

      this._connection.callService(domain, service, options)
        .then((returnedData) => {
          if (resolve) {
            resolve(returnedData)
          }
        })
        .catch(e => {
          Logger.error(e)
          if (reject) {
            reject(e)
          }
        })

    })
  }

  /**
   * Get all states and stores their values in the map
   *
   * @private
   * @returns {Promise<void>}      Promise
   * @memberof API
   */
  private async _syncStates(): Promise<void> {
    return new Promise((resolve, reject) => {
      this._connection.getStates()
        .catch(reject)
        .then((states) => {
          if (!states) {
            resolve()
          } else {
            states = states.map((state: IState) => {
              state.last_changed = new Date(state.last_changed)
              state.last_updated = new Date(state.last_updated)
              return state
            })

            for (const state of states) {
              this._states.set(state.entity_id, state)
            }
            resolve()
          }
        })
    })
  }

  /**
   * Initiates subscription to all states changes.
   * Logs any change to the console, stores the new state in the states map
   * and call all callback functions from listeners.
   *
   * @private
   * @memberof API
   */
  private _onStateChange() {
    // Subscribing to Home Assistant state_change event
    this._connection.subscribeEvent('state_changed', (message) => {
      const newState: IState = message.data.new_state
      if (!newState) {
        return
      }
      Logger.debug(`New state of ${newState.attributes.friendly_name} (${newState.entity_id}): ${newState.state}`)
      this._states.set(newState.entity_id, newState)

      if (this._stateListeners.has(newState.entity_id)) {
        const listeners = this._stateListeners.get(newState.entity_id)
        if (listeners) {
          for (const listener of listeners) {
            try {
              listener.callback(newState, message.data.old_state)
            } catch (e) {
              Logger.error(e)
            }
          }
        }
      }
    })
      .catch((error) => {
        Logger.error(error)
      })
  }
  
  /**
   * Initiates subscription to all automation trigger events.
   * Logs any change to the console, and call all callback functions from listeners.
   *
   * @private
   * @memberof API
   */
   private _onAutomationTrigger() {
    // Subscribing to Home Assistant state_change event
    this._connection.subscribeEvent('automation_triggered', (message) => {
      const { name, entity_id } = message.data
      Logger.debug(`Automation "${name}" triggered (${entity_id})`)

      if (this._automationListeners.has(entity_id)) {
        const listeners = this._automationListeners.get(entity_id)
        if (listeners) {
          for (const listener of listeners) {
            try {
              listener.callback()
            } catch (e) {
              Logger.error(e)
            }
          }
        }
      }
    })
      .catch((error) => {
        Logger.error(error)
      })
  }

  /**
   * Load all automations and watch for changes
   * When automation file changes, it will be unloaded
   * and loaded on the fly
   *
   * @private
   * @returns {Promise<void>}
   * @memberof API
   */
  private async _bootstrap(): Promise<void> {
    const automationsDir: string = path.resolve(path.join(__dirname, '..', 'automations'))
    // Watch for changes
    const watcher = chokidar.watch(`${automationsDir}/**/**`)
    watcher.on('change', (filename) => {
      this._modifiedFile('change', filename)
    })
    watcher.on('add', (filename) => {
      this._modifiedFile('add', filename)
    })
    watcher.on('unlink', (filename) => {
      this._modifiedFile('remove', filename)
    })
  }

  /**
   * Handle modified automation file
   * If automation has previously loaded, unloads it an reloads.
   * It the automation is new, loads it
   *
   * @private
   * @param {string} ev            Event fired (change or add)
   * @param {string} filename      File path that has changed
   * @memberof API
   */
  private _modifiedFile(ev: string, filename: string) {
    if (!/\.ts$/.test(filename) || /\/\.?lib\//.test(filename)) {
      return
    }
    delete require.cache[require.resolve(path.join(filename))]

    if (this._automations.has(filename)) {
      const c = this._automations.get(filename)
      if (c) {
        c.destroy()
        this._automations.delete(filename)
      }
    }
    if (/(change|add)/.test(ev)) {
      try {
        this._loadAutomation(filename)
      } catch (e) {
        Logger.error(e)
      }
    }
  }

  private _loadAutomation(filename: string) {
    try {
      const newC = require(filename)
      this._automations.set(filename, new newC())
    } catch (e) {
      Logger.error(e)
    }
  }

  /**
   * Unloads automation class
   *
   * @private
   * @memberof API
   */
  private _unload() {
    Array.from(this._automations).forEach((automation) => {
      Logger.debug(`Unloading ${automation[0]}`)
      try {
        automation[1].destroy()
      } catch (e) {
        Logger.error(e)
      }
      this._automations.delete(automation[0])
    })
  }
}

export default API
