
export interface IpcBusClient {
    connect(callback: Function) : void;
    subscribe(topic: string, handler: Function) : void;
    send(topic: string, payload: Object | string) : void;
    request(topic: string, payload: Object | string, replyHandler : Function, timeoutDelay : number) : void;
    unsubscribe(topic: string, handler: Function) : void;
    queryBrokerState(topic: string) : void;
    close() : void;
}

export interface IpcBusBroker {
    start() : void;
    stop() : void;
}

import {IpcBusBrokerClient} from "./IpcBusBroker";

export function CreateIPCBusBroker() : IpcBusBroker {
    const busPath = arguments.length >= 1 ? arguments[1] : null;

    return new IpcBusBrokerClient(busPath) as IpcBusBroker;
}

import {IpcBusNodeClient} from "./IpcBusNode";
import {IpcBusMasterClient} from "./IpcBusMaster";
import {IpcBusRendererClient} from "./IpcBusRenderer";

export function CreateIPCBusClient() : IpcBusClient {
    const busPath = arguments.length >= 1 ? arguments[0] : null;

    const processType = (process as any)["type"];
    switch (processType)
    {   
        case 'renderer' :
            return new IpcBusRendererClient() as IpcBusClient;

        case 'browser' :
            return new IpcBusMasterClient(busPath) as IpcBusClient;

        default :    
            return new IpcBusNodeClient(busPath) as IpcBusClient;
    } 
}