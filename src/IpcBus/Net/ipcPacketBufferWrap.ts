import { Buffer } from 'buffer';
import { BufferReader } from './bufferReader';
import { Writer } from './writer';

const headerSeparator: number = '['.charCodeAt(0);
const footerSeparator: number = ']'.charCodeAt(0);

const MinHeaderLength: number = 2;
const MaxHeaderLength: number = MinHeaderLength + 4;

const FooterLength: number = 1;
// const StringHeaderLength: number = MinHeaderLength + 4;
// const BufferHeaderLength: number = MinHeaderLength + 4;
// const ArrayHeaderLength: number = MinHeaderLength + 4;
const ObjectHeaderLength: number = MinHeaderLength + 4;
const ArrayHeaderLength: number = MinHeaderLength + 4;

export enum BufferType {
    HeaderNotValid = 'X'.charCodeAt(0),
    HeaderPartial = 'x'.charCodeAt(0),
    ContentPartial = 'y'.charCodeAt(0),
    String = 's'.charCodeAt(0),
    Buffer = 'B'.charCodeAt(0),
    Boolean = 'b'.charCodeAt(0),
    Array = 'A'.charCodeAt(0),
    PositiveInteger = '+'.charCodeAt(0),
    NegativeInteger = '-'.charCodeAt(0),
    Double = 'd'.charCodeAt(0),
    Object = 'O'.charCodeAt(0)
};

export class IpcPacketBufferWrap {
    protected _type: BufferType;
    protected _packetSize: number;
    protected _contentSize: number;
    protected _headerSize: number;
    protected _argsLen: number;

    protected constructor() {
        this._type = BufferType.HeaderNotValid;
    }

    static fromType(bufferType: BufferType) {
        let header = new IpcPacketBufferWrap();
        header.type = bufferType;
        return header;
    }

    static fromBufferHeader(bufferReader: BufferReader) {
        let header = new IpcPacketBufferWrap();
        header.readHeader(bufferReader);
        return header;
    }

    get type(): BufferType {
        return this._type;
    }

    set type(bufferType: BufferType) {
        if (this._type === bufferType) {
            return;
        }
        this._type = bufferType;
        switch (this._type) {
            case BufferType.Double:
                this._headerSize = MinHeaderLength;
                this.setContentSize(8);
                break;
            case BufferType.NegativeInteger:
            case BufferType.PositiveInteger:
                this._headerSize = MinHeaderLength;
                this.setContentSize(4);
                break;
            case BufferType.Array:
                this._headerSize = ArrayHeaderLength;
                this.setContentSize(0);
                break;
            case BufferType.Object:
            case BufferType.String:
            case BufferType.Buffer:
                this._headerSize = ObjectHeaderLength;
                break;
            case BufferType.Boolean:
                this._headerSize = MinHeaderLength;
                this.setContentSize(1);
                break;
            default:
                this._type = BufferType.HeaderNotValid;
                break;
        }
    }

    get argsLen(): number {
        return this._argsLen;
    }

    set argsLen(argsLen: number) {
        this._argsLen = argsLen;
    }

    get packetSize(): number {
        return this._packetSize;
    }

    set packetSize(packetSize: number) {
        if (this._packetSize === packetSize) {
            return;
        }
        switch (this._type) {
            case BufferType.Object:
            case BufferType.String:
            case BufferType.Buffer:
                this.setPacketSize(packetSize);
                break;
        }
    }

    protected setPacketSize(packetSize: number) {
        this._packetSize = packetSize;
        this._contentSize = this._packetSize - this._headerSize - FooterLength;
    }

    get contentSize(): number {
        return this._contentSize;
    }

    set contentSize(contentSize: number) {
        if (this._contentSize === contentSize) {
            return;
        }
        switch (this._type) {
            case BufferType.Object:
            case BufferType.String:
            case BufferType.Buffer:
                this.setContentSize(contentSize);
                break;
        }
    }

    protected setContentSize(contentSize: number) {
        this._contentSize = contentSize;
        this._packetSize = this._contentSize + this._headerSize + FooterLength;
    }

    get footerSize(): number {
        return FooterLength;
    }

    get headerSize(): number {
        return this._headerSize;
    }

    readHeader(bufferReader: BufferReader): number {
        this._type = BufferType.HeaderNotValid;
        if (bufferReader.readByte() !== headerSeparator) {
            return 0;
        }
        this.type = bufferReader.readByte();
        if (bufferReader.offset + this._headerSize >= bufferReader.length) {
            this._type = BufferType.HeaderPartial;
        }
        else {
            switch (this.type) {
                case BufferType.Array:
                    this._argsLen = bufferReader.readUInt32();
                    break;
                case BufferType.Object:
                case BufferType.String:
                case BufferType.Buffer:
                    this.setPacketSize(bufferReader.readUInt32());
                    break;
            }
        }
        return bufferReader.offset;
    }

    readHeaderFromBuffers(buffers: Buffer[], offset: number): void {
        let buffer = buffers[0];
        const offsetHeaderLength = offset + MaxHeaderLength;
        // Buffer is too short for containing a header
        if (buffer.length < offsetHeaderLength) {
            // No hope, there is only one buffer
            if (buffers.length === 1) {
                this._type = BufferType.HeaderPartial;
            }
            // Create a buffer buffers with the minimum size
            buffer = Buffer.concat(buffers, offsetHeaderLength);
            // Still not enough !
            if (buffer.length < offsetHeaderLength) {
                this._type = BufferType.HeaderPartial;
            }
        }
        this.readHeader(new BufferReader(buffer, offset));
    }

    isValid(): boolean {
        return this._type !== BufferType.HeaderNotValid;
    }

    isPartial(): boolean {
        return this._type === BufferType.HeaderPartial;
    }

    isArray(): boolean {
        return this._type === BufferType.Array;
    }

    isObject(): boolean {
        return this._type === BufferType.Object;
    }

    isString(): boolean {
        return this._type === BufferType.String;
    }

    isBuffer(): boolean {
        return this._type === BufferType.Buffer;
    }

    isNumber(): boolean {
        switch (this._type) {
            case BufferType.NegativeInteger:
            case BufferType.PositiveInteger:
            case BufferType.Double:
                return true;
            default:
                return false;
        }
    }

    isBoolean(): boolean {
        return this._type === BufferType.Boolean;
    }

    writeHeader(bufferWriter: Writer): number {
        bufferWriter.writeBytes([headerSeparator, this._type]);
        switch (this._type) {
            case BufferType.Array:
                bufferWriter.writeUInt32(this._argsLen);
                break;
            case BufferType.Object:
            case BufferType.String:
            case BufferType.Buffer:
                bufferWriter.writeUInt32(this._packetSize);
                break;
        }
        return bufferWriter.length;
    }

    writeFooter(bufferWriter: Writer): number {
        return bufferWriter.writeByte(footerSeparator);
    }
}