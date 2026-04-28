import { CARD_CATALOG } from './cardCatalog';

const DECK_SHARE_MAGIC_BYTE = 0xa7;
const DECK_SHARE_VERSION_BYTE = 0x01;
const DECK_SHARE_HEADER_LENGTH = 4;
const DECK_SHARE_CHECKSUM_LENGTH = 1;

const CANONICAL_CARD_IDS: string[] = Array.from(new Set(CARD_CATALOG.map((entry) => entry.id)))
    .sort((a, b) => a.localeCompare(b));

const CARD_INDEX_BY_ID: Map<string, number> = new Map(
    CANONICAL_CARD_IDS.map((id, index) => [id, index])
);

const CATALOG_VERSION_MARKER = computeCatalogVersionMarker(CANONICAL_CARD_IDS);

export type DeckShareEncodeErrorCode = 'unknown_card_id' | 'too_many_cards';

export type DeckShareEncodeResult =
    | {
        ok: true;
        shareHex: string;
        cardCount: number;
    }
    | {
        ok: false;
        code: DeckShareEncodeErrorCode;
        message: string;
        cardId?: string;
    };

export type DeckShareDecodeErrorCode =
    | 'empty_input'
    | 'malformed_hex'
    | 'payload_too_short'
    | 'magic_mismatch'
    | 'version_mismatch'
    | 'catalog_mismatch'
    | 'payload_length_mismatch'
    | 'checksum_mismatch'
    | 'unknown_card_index';

export type DeckShareDecodeResult =
    | {
        ok: true;
        cardIds: string[];
        cardCount: number;
        version: number;
    }
    | {
        ok: false;
        code: DeckShareDecodeErrorCode;
        message: string;
        details?: string;
    };

function computeCatalogVersionMarker (cardIds: string[]): number
{
    let marker = 0;

    for (let i = 0; i < cardIds.length; i += 1) {
        const cardId = cardIds[i];
        marker = (marker + i + 1) & 0xff;
        for (let j = 0; j < cardId.length; j += 1) {
            marker = (marker + cardId.charCodeAt(j)) & 0xff;
        }
    }

    return marker;
}

function computeChecksumByte (bytes: Uint8Array): number
{
    let checksum = 0;
    for (let i = 0; i < bytes.length; i += 1) {
        checksum = (checksum + bytes[i]) & 0xff;
    }
    return checksum;
}

function bytesToHex (bytes: Uint8Array): string
{
    let out = '';
    for (let i = 0; i < bytes.length; i += 1) {
        out += bytes[i].toString(16).padStart(2, '0');
    }
    return out.toUpperCase();
}

function decodeHexString (hex: string): Uint8Array | null
{
    if (hex.length % 2 !== 0) {
        return null;
    }

    if (!/^[0-9a-f]+$/i.test(hex)) {
        return null;
    }

    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < hex.length; i += 2) {
        const parsed = Number.parseInt(hex.slice(i, i + 2), 16);
        if (!Number.isFinite(parsed)) {
            return null;
        }
        bytes[i / 2] = parsed;
    }
    return bytes;
}

function readUint16BE (bytes: Uint8Array, offset: number): number
{
    return (bytes[offset] << 8) | bytes[offset + 1];
}

export function encodeDeckShareHex (cardIds: string[]): DeckShareEncodeResult
{
    if (cardIds.length > 255) {
        return {
            ok: false,
            code: 'too_many_cards',
            message: 'Deck share format supports up to 255 cards.'
        };
    }

    const sortedIndexes: number[] = [];
    for (const cardId of cardIds) {
        const index = CARD_INDEX_BY_ID.get(cardId);
        if (index === undefined) {
            return {
                ok: false,
                code: 'unknown_card_id',
                message: `Unknown card ID in deck: ${cardId}`,
                cardId,
            };
        }
        sortedIndexes.push(index);
    }

    sortedIndexes.sort((a, b) => a - b);

    const payloadWithoutChecksum = new Uint8Array(
        DECK_SHARE_HEADER_LENGTH + (sortedIndexes.length * 2)
    );

    payloadWithoutChecksum[0] = DECK_SHARE_MAGIC_BYTE;
    payloadWithoutChecksum[1] = DECK_SHARE_VERSION_BYTE;
    payloadWithoutChecksum[2] = CATALOG_VERSION_MARKER;
    payloadWithoutChecksum[3] = sortedIndexes.length;

    let cursor = DECK_SHARE_HEADER_LENGTH;
    for (const index of sortedIndexes) {
        payloadWithoutChecksum[cursor] = (index >> 8) & 0xff;
        payloadWithoutChecksum[cursor + 1] = index & 0xff;
        cursor += 2;
    }

    const checksum = computeChecksumByte(payloadWithoutChecksum);
    const payload = new Uint8Array(payloadWithoutChecksum.length + DECK_SHARE_CHECKSUM_LENGTH);
    payload.set(payloadWithoutChecksum, 0);
    payload[payload.length - 1] = checksum;

    return {
        ok: true,
        shareHex: bytesToHex(payload),
        cardCount: cardIds.length,
    };
}

export function decodeDeckShareHex (input: string): DeckShareDecodeResult
{
    const normalized = input.trim().replace(/\s+/g, '');
    if (normalized.length === 0) {
        return {
            ok: false,
            code: 'empty_input',
            message: 'Deck share code is empty.'
        };
    }

    const payload = decodeHexString(normalized);
    if (!payload) {
        return {
            ok: false,
            code: 'malformed_hex',
            message: 'Deck share code must be valid hexadecimal text.'
        };
    }

    if (payload.length < (DECK_SHARE_HEADER_LENGTH + DECK_SHARE_CHECKSUM_LENGTH)) {
        return {
            ok: false,
            code: 'payload_too_short',
            message: 'Deck share code is too short.'
        };
    }

    if (payload[0] !== DECK_SHARE_MAGIC_BYTE) {
        return {
            ok: false,
            code: 'magic_mismatch',
            message: 'Deck share code magic byte is not recognized.'
        };
    }

    if (payload[1] !== DECK_SHARE_VERSION_BYTE) {
        return {
            ok: false,
            code: 'version_mismatch',
            message: `Unsupported deck share version: ${payload[1]}.`
        };
    }

    if (payload[2] !== CATALOG_VERSION_MARKER) {
        return {
            ok: false,
            code: 'catalog_mismatch',
            message: 'Deck share code was created for a different card catalog version.'
        };
    }

    const cardCount = payload[3];
    const expectedLength = DECK_SHARE_HEADER_LENGTH + (cardCount * 2) + DECK_SHARE_CHECKSUM_LENGTH;
    if (payload.length !== expectedLength) {
        return {
            ok: false,
            code: 'payload_length_mismatch',
            message: 'Deck share code payload length does not match card count.',
            details: `Expected ${expectedLength} bytes, received ${payload.length}.`
        };
    }

    const payloadWithoutChecksum = payload.slice(0, payload.length - 1);
    const expectedChecksum = computeChecksumByte(payloadWithoutChecksum);
    const checksum = payload[payload.length - 1];
    if (checksum !== expectedChecksum) {
        return {
            ok: false,
            code: 'checksum_mismatch',
            message: 'Deck share checksum mismatch.',
            details: `Expected ${expectedChecksum}, received ${checksum}.`
        };
    }

    const cardIds: string[] = [];
    let cursor = DECK_SHARE_HEADER_LENGTH;
    for (let i = 0; i < cardCount; i += 1) {
        const index = readUint16BE(payload, cursor);
        cursor += 2;
        const cardId = CANONICAL_CARD_IDS[index];
        if (!cardId) {
            return {
                ok: false,
                code: 'unknown_card_index',
                message: `Deck share references unknown card index ${index}.`
            };
        }
        cardIds.push(cardId);
    }

    return {
        ok: true,
        cardIds,
        cardCount,
        version: payload[1],
    };
}
