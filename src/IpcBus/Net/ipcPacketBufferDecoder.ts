import { Buffer } from 'buffer';
import { EventEmitter } from 'events';
import { IpcPacketBufferWrap, BufferType } from './ipcPacketBufferWrap';
import { IpcPacketBuffer } from './ipcPacketBuffer';

export class IpcPacketBufferDecoder extends EventEmitter {
    private _buffers: Buffer[];
    private _totalLength: number;
    private _offset: number;
    private _header: IpcPacketBufferWrap;

    constructor() {
        super();
        this._totalLength = 0;
        this._offset = 0;
        this._buffers = [];
        this._header = IpcPacketBufferWrap.fromType(BufferType.HeaderNotValid);
    }

    on(event: 'packet', handler: (buffer: IpcPacketBuffer) => void): this;
    on(event: 'packet[]', handler: (buffer: IpcPacketBuffer[]) => void): this;
    on(event: 'error', handler: (err: Error) => void): this;
    on(event: string, handler: Function): this {
        return super.on(event, handler);
    }

    handleData(data: Buffer): void {
        this._totalLength += data.length;
        this._buffers.push(data);

        let packets: IpcPacketBuffer[] = [];

        while (this._totalLength > 0) {
            this._header.readHeaderFromBuffers(this._buffers, this._totalLength, this._offset);
            // if packet size error
            if (!this._header.isValid()) {
                this._buffers = [];
                this.emit('error', new Error('Get invalid packet size'));
                break;
            }
            // if not enough data accumulated for reading the header, exit
            if (this._header.isPartial()) {
                break;
            }
            let packetSize = this._header.packetSize;
            // if not enough data accumulated for reading the packet, exit
            if (this._totalLength < packetSize) {
                break;
            }

            // Compute totalLengh in advance (see the opt after concat call)
            this._totalLength -= this._header.packetSize;

            let buffer: Buffer;
            let currentBuffer = this._buffers[0];
            if (currentBuffer.length - this._offset >= packetSize) {
                buffer = currentBuffer.slice(this._offset, this._offset + packetSize);
            }
            else {
                if (this._offset > 0) {
                    this._buffers[0] = currentBuffer = currentBuffer.slice(this._offset);
                    this._offset = 0;
                }
                buffer = Buffer.concat(this._buffers, packetSize);
                // Don't waste your time to clean buffers if there were all used !
                if (this._totalLength > 0) {
                    while (currentBuffer && (currentBuffer.length <= packetSize)) {
                        packetSize -= currentBuffer.length;

                        this._buffers.shift();
                        currentBuffer = this._buffers[0];
                    }
                }
            }
            let packet = IpcPacketBuffer.fromPacketBuffer(this._header, buffer);
            packets.push(packet);
            this.emit('packet', packet);

            this._offset += packetSize;
        }
        if ((this._buffers.length === 0) || (this._totalLength === 0)) {
            this._totalLength = 0;
            this._offset = 0;
            this._buffers = [];
        }
        this.emit('packet[]', packets);
    }
}
