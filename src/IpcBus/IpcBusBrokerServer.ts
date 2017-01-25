/// <reference path='typings/easy-ipc.d.ts'/>

import * as BaseIpc from 'easy-ipc';
import * as IpcBusInterfaces from './IpcBusInterfaces';
import * as IpcBusUtils from './IpcBusUtils';
import {IpcBusData} from './IpcBusClient';
// import * as util from 'util';

/** @internal */
export class IpcBusBrokerServer implements IpcBusInterfaces.IpcBusBroker {
    private _baseIpc: BaseIpc;
    private _ipcServer: any = null;
    private _ipcOptions: IpcBusUtils.IpcOptions;
    private _subscriptions: IpcBusUtils.ChannelConnectionMap;
    private _requestSubscriptions: Map<string, IpcBusUtils.ChannelConnectionMap.ConnectionData>;

    constructor(ipcOptions: IpcBusUtils.IpcOptions) {
        this._ipcOptions = ipcOptions;
        this._baseIpc = new BaseIpc();
        this._subscriptions = new IpcBusUtils.ChannelConnectionMap('[IPCBus:Broker]');
        this._requestSubscriptions = new Map<string, IpcBusUtils.ChannelConnectionMap.ConnectionData>();
        this._baseIpc.on('connection', (socket: any, server: any) => this._onConnection(socket, server));
        this._baseIpc.on('close', (err: any, socket: any, server: any) => this._onClose(err, socket, server));
        this._baseIpc.on('data', (data: any, socket: any, server: any) => this._onData(data, socket, server));
    }

    // Set API
    start(timeoutDelay?: number): Promise<string> {
        if (timeoutDelay == null) {
            timeoutDelay = 2000;
        }
        let p = new Promise<string>((resolve, reject) => {
            this._baseIpc.once('listening', (server: any) => {
                this._ipcServer = server;
                IpcBusUtils.Logger.info(`[IPCBus:Broker] Listening for incoming connections on ${this._ipcOptions}`);
                resolve('started');
            });
            setTimeout(() => {
                reject('timeout');
            }, timeoutDelay);
            this._baseIpc.listen(this._ipcOptions.port, this._ipcOptions.host);
        });
        return p;
    }

    stop() {
        if (this._ipcServer != null) {
            this._ipcServer.close();
            this._ipcServer = null;
        }
    }

    queryState(): Object {
        let queryStateResult: Object[] = [];
        this._subscriptions.forEach(function (connData, channel) {
            connData.peerNames.forEach(function (count: number, peerName: string) {
                queryStateResult.push({ channel: channel, peerName: peerName, count: count });
            });
        });
        return queryStateResult;
    }

    private _onConnection(socket: any, server: any): void {
        IpcBusUtils.Logger.info(`[IPCBus:Broker] Incoming connection !`);
        IpcBusUtils.Logger.info('[IPCBus:Broker] socket.address=' + JSON.stringify(socket.address()));
        IpcBusUtils.Logger.info('[IPCBus:Broker] socket.localAddress=' + socket.localAddress);
        IpcBusUtils.Logger.info('[IPCBus:Broker] socket.remoteAddress=' + socket.remoteAddress);
        IpcBusUtils.Logger.info('[IPCBus:Broker] socket.remoteAddress=' + socket.remoteAddress);
        IpcBusUtils.Logger.info('[IPCBus:Broker] socket.remotePort=' + socket.remotePort);
        socket.on('error', (err: string) => {
            IpcBusUtils.Logger.info(`[IPCBus:Broker] Error on connection: ${err}`);
        });
    }

    private _onClose(err: any, socket: any, server: any): void {
        this._subscriptions.releaseConnection(socket);
        IpcBusUtils.Logger.info(`[IPCBus:Broker] Connection closed !`);
    }

    private _onData(data: any, socket: any, server: any): void {
        if (BaseIpc.Cmd.isCmd(data)) {
            switch (data.name) {
                case IpcBusUtils.IPC_BUS_COMMAND_SUBSCRIBE_CHANNEL:
                    {
//                        const ipcBusData: IpcBusData = data.args[0];
                        const ipcBusEvent: IpcBusInterfaces.IpcBusEvent = data.args[1];
                        IpcBusUtils.Logger.info(`[IPCBus:Broker] Subscribe to channel '${ipcBusEvent.channel}' from peer #${ipcBusEvent.sender.peerName}`);

                        this._subscriptions.addRef(ipcBusEvent.channel, socket.remotePort, socket, ipcBusEvent.sender.peerName);
                        break;
                    }
                case IpcBusUtils.IPC_BUS_COMMAND_UNSUBSCRIBE_CHANNEL:
                    {
                        const ipcBusData: IpcBusData = data.args[0];
                        const ipcBusEvent: IpcBusInterfaces.IpcBusEvent = data.args[1];
                        IpcBusUtils.Logger.info(`[IPCBus:Broker] Unsubscribe from channel '${ipcBusEvent.channel}' from peer #${ipcBusEvent.sender.peerName}`);

                        if (ipcBusData.unsubscribeAll) {
                            this._subscriptions.releasePeerName(ipcBusEvent.channel, socket.remotePort, ipcBusEvent.sender.peerName);
                        }
                        else {
                            this._subscriptions.release(ipcBusEvent.channel, socket.remotePort, ipcBusEvent.sender.peerName);
                        }
                        break;
                    }
                case IpcBusUtils.IPC_BUS_COMMAND_SENDMESSAGE:
                    {
                        const ipcBusData: IpcBusData = data.args[0];
                        const ipcBusEvent: IpcBusInterfaces.IpcBusEvent = data.args[1];
                        IpcBusUtils.Logger.info(`[IPCBus:Broker] Received send on channel '${ipcBusEvent.channel}' from peer #${ipcBusEvent.sender.peerName}`);

                        this._subscriptions.forEachChannel(ipcBusEvent.channel, function (connData, channel) {
                            // Send data to subscribed connections
                            BaseIpc.Cmd.exec(IpcBusUtils.IPC_BUS_EVENT_SENDMESSAGE, ipcBusData, ipcBusEvent, data.args[2], connData.conn);
                        });
                        break;
                    }
                case IpcBusUtils.IPC_BUS_COMMAND_REQUESTMESSAGE:
                    {
                        const ipcBusData: IpcBusData = data.args[0];
                        const ipcBusEvent: IpcBusInterfaces.IpcBusEvent = data.args[1];
                        IpcBusUtils.Logger.info(`[IPCBus:Broker] Received request on channel '${ipcBusEvent.channel}' (reply = '${ipcBusData.replyChannel}') from peer #${ipcBusEvent.sender.peerName}`);

                        // Register on the replyChannel
                        this._requestSubscriptions.set(ipcBusData.replyChannel, new IpcBusUtils.ChannelConnectionMap.ConnectionData(socket.remotePort, socket));
                        this._subscriptions.forEachChannel(ipcBusEvent.channel, function (connData, channel) {
                            // Request data to subscribed connections
                            BaseIpc.Cmd.exec(IpcBusUtils.IPC_BUS_EVENT_REQUESTMESSAGE, ipcBusData, ipcBusEvent, data.args[2], connData.conn);
                        });
                        break;
                    }
                case IpcBusUtils.IPC_BUS_COMMAND_REQUESTRESPONSE:
                    {
                        const ipcBusData: IpcBusData = data.args[0];
                        const ipcBusEvent: IpcBusInterfaces.IpcBusEvent = data.args[1];
                        IpcBusUtils.Logger.info(`[IPCBus:Broker] Received response request on channel '${ipcBusEvent.channel}' (reply = '${ipcBusData.replyChannel}') from peer #${ipcBusEvent.sender.peerName}`);

                        let connData: IpcBusUtils.ChannelConnectionMap.ConnectionData = this._requestSubscriptions.get(ipcBusData.replyChannel);
                        if (connData) {
                            this._requestSubscriptions.delete(ipcBusData.replyChannel);
                            // Send data to subscribed connections
                            BaseIpc.Cmd.exec(IpcBusUtils.IPC_BUS_EVENT_REQUESTRESPONSE, ipcBusData, ipcBusEvent, data.args[2], connData.conn);
                        }
                        break;
                    }
                case IpcBusUtils.IPC_BUS_COMMAND_REQUESTCANCEL:
                    {
                        const ipcBusData: IpcBusData = data.args[0];
                        const ipcBusEvent: IpcBusInterfaces.IpcBusEvent = data.args[1];
                        IpcBusUtils.Logger.info(`[IPCBus:Broker] Received cancel request on channel '${ipcBusEvent.channel}' (reply = '${ipcBusData.replyChannel}') from peer #${ipcBusEvent.sender.peerName}`);
                        this._requestSubscriptions.delete(ipcBusData.replyChannel);
                        break;
                    }
            }
        }
    }
}