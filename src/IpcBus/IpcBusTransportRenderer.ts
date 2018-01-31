/// <reference types='node' />

import * as assert from 'assert';

import * as IpcBusUtils from './IpcBusUtils';
import * as IpcBusInterfaces from './IpcBusInterfaces';

import { IpcBusTransport, IpcBusData, IpcBusCommand } from './IpcBusTransport';

// Implementation for renderer process
/** @internal */
export class IpcBusTransportRenderer extends IpcBusTransport {
    private _ipcRenderer: any;
    private _onIpcEventReceived: Function;
    private _promiseConnected: Promise<string>;

    private _ipcRendererReady: Promise<void>;

    constructor(processType: IpcBusInterfaces.IpcBusProcessType, ipcOptions: IpcBusUtils.IpcOptions) {
        assert(processType === 'renderer', `IpcBusTransportRenderer: processType must not be a process ${processType}`);
        super({ type: processType, pid: -1 }, ipcOptions);

// ipcRenderer is not ready until the DOM Content is loaded (https://github.com/electron/electron/issues/7455)
        this._ipcRendererReady = new Promise<void>((resolve, reject) => {
            IpcBusUtils.Logger.enable && IpcBusUtils.Logger.info(`[IPCBus:Renderer] document readystate=${document.readyState}`);
            if (document.readyState !== 'loading') {
                IpcBusUtils.Logger.enable && IpcBusUtils.Logger.info(`[IPCBus:Renderer] is ready`);
                resolve();
            }
            else {
                IpcBusUtils.Logger.enable && IpcBusUtils.Logger.info(`[IPCBus:Renderer] wait for readiness`);
                let onWaitingForIpcRendererReadiness = () => {
                    if (document.readyState !== 'loading') {
                        document.removeEventListener('readystatechange', onWaitingForIpcRendererReadiness);
                        IpcBusUtils.Logger.enable && IpcBusUtils.Logger.info(`[IPCBus:Renderer] is ready`);
                        resolve();
                    }
                };
                document.addEventListener('readystatechange', onWaitingForIpcRendererReadiness);
            }
        });
    }

    protected _reset() {
        this._promiseConnected = null;
        if (this._ipcRenderer) {
            this._ipcRenderer.removeAllListeners(IpcBusUtils.IPC_BUS_COMMAND_CONNECT);
            this._ipcRenderer.removeAllListeners(IpcBusUtils.IPC_BUS_RENDERER_EVENT);
            this._ipcRenderer = null;
        }
    }

    protected _onClose() {
        this._reset();
    }

    private _onConnect(eventOrPeer: any, peerOrUndefined: IpcBusInterfaces.IpcBusPeer): void {
        // In sandbox mode, 1st parameter is no more the event, but the 2nd argument !!!
        if (peerOrUndefined) {
            this._ipcBusPeer = peerOrUndefined;
            IpcBusUtils.Logger.enable && IpcBusUtils.Logger.info(`[IPCBus:Renderer] Activate Standard listening for #${this._ipcBusPeer.name}`);
            this._onIpcEventReceived = (eventEmitter: any, ipcBusCommand: IpcBusCommand, args: any[]) => this._onEventReceived(ipcBusCommand, args);
        } else {
            this._ipcBusPeer = eventOrPeer;
            IpcBusUtils.Logger.enable && IpcBusUtils.Logger.info(`[IPCBus:Renderer] Activate Sandbox listening for #${this._ipcBusPeer.name}`);
            this._onIpcEventReceived = (ipcBusCommand: IpcBusCommand, args: any[]) => this._onEventReceived(ipcBusCommand, args);
        }
        this._ipcRenderer.addListener(IpcBusUtils.IPC_BUS_RENDERER_EVENT, this._onIpcEventReceived);
    };

    /// IpcBusTrandport API
    ipcConnect(timeoutDelay: number, peerName?: string): Promise<string> {
        // Store in a local variable, in case it is set to null (paranoid code as it is asynchronous!)
        let p = this._promiseConnected;
        if (!p) {
            p = this._promiseConnected = new Promise<string>((resolve, reject) => {
                this._ipcRendererReady.then(() => {
                    this._ipcRenderer = require('electron').ipcRenderer;
                    // Do not type timer as it may differ between node and browser api, let compiler and browserify deal with.
                    let timer: NodeJS.Timer;
                    // Below zero = infinite
                    if (timeoutDelay >= 0) {
                        timer = setTimeout(() => {
                            timer = null;
                            this._reset();
                            reject('timeout');
                        }, timeoutDelay);
                    }
                    // We wait for the bridge confirmation
                    this._ipcRenderer.once(IpcBusUtils.IPC_BUS_COMMAND_CONNECT, (eventOrPeer: any, peerOrUndefined: IpcBusInterfaces.IpcBusPeer) => {
                        if (this._ipcRenderer) {
                            clearTimeout(timer);
                            this._onConnect(eventOrPeer, peerOrUndefined);
                            resolve('connected');
                        }
                        else {
                            this._reset();
                        }
                    });
                    this.ipcPushCommand(IpcBusUtils.IPC_BUS_COMMAND_CONNECT, '', {}, [peerName]);
                });
            });
        }
        return p;
    }

    ipcClose(): void {
        this.ipcPushCommand(IpcBusUtils.IPC_BUS_COMMAND_CLOSE, '', {});
        this._reset();
    }

    ipcPushCommand(command: string, channel: string | RegExp, ipcBusData: IpcBusData, args?: any[]): void {
        if (this._ipcRenderer) {
            if (channel instanceof RegExp) {
                ipcBusData.regExpChannel = true;
                this._ipcRenderer.send(IpcBusUtils.IPC_BUS_RENDERER_COMMAND, command, channel.toString(), this.peer, ipcBusData, args);
            }
            else {
                this._ipcRenderer.send(IpcBusUtils.IPC_BUS_RENDERER_COMMAND, command, channel, this.peer, ipcBusData, args);
            }
        }
    }
}

