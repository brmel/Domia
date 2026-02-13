import { ActionType } from '@domain/enums/ActionType';

export function normalizeActionPayload(payload: unknown): unknown {
    if (!payload || typeof payload !== 'object') {
        return payload;
    }

    const root = payload as Record<string, unknown>;
    const rawAction = root['action'] && typeof root['action'] === 'object'
        ? root['action'] as Record<string, unknown>
        : root;

    const normalizedAction: Record<string, unknown> = {
        ...rawAction,
    };

    normalizedAction['type'] = normalizeType(rawAction['type']);

    const parsedId = parseElementId(
        rawAction['elementId']
        ?? rawAction['element_id']
        ?? rawAction['id']
        ?? rawAction['targetElementId']
        ?? rawAction['target_element_id']
    );
    if (parsedId !== undefined) {
        normalizedAction['elementId'] = parsedId;
    }

    if (normalizedAction['type'] === ActionType.WAIT && normalizedAction['durationMs'] === undefined) {
        if (typeof rawAction['duration'] === 'number' || typeof rawAction['duration'] === 'string') {
            normalizedAction['durationMs'] = rawAction['duration'];
        }
    }

    if (normalizedAction['type'] === ActionType.PASS && normalizedAction['summary'] === undefined) {
        if (typeof root['summary'] === 'string') {
            normalizedAction['summary'] = root['summary'];
        } else if (typeof root['thought'] === 'string') {
            normalizedAction['summary'] = root['thought'];
        }
    }

    if (normalizedAction['type'] === ActionType.FAIL && normalizedAction['reason'] === undefined) {
        if (typeof root['reason'] === 'string') {
            normalizedAction['reason'] = root['reason'];
        } else if (typeof root['thought'] === 'string') {
            normalizedAction['reason'] = root['thought'];
        }
    }

    return {
        thought: typeof root['thought'] === 'string' ? root['thought'] : undefined,
        action: normalizedAction,
    };
}

function normalizeType(rawType: unknown): unknown {
    if (typeof rawType !== 'string') {
        return rawType;
    }

    const compact = rawType.toLowerCase().replace(/[^a-z]/g, '');

    if (compact === 'click' || compact === 'clickelement') return ActionType.CLICK;
    if (compact === 'type' || compact === 'typetext') return ActionType.TYPE;
    if (compact === 'presskey' || compact === 'key') return ActionType.PRESS_KEY;
    if (compact === 'scroll' || compact === 'scrollpage') return ActionType.SCROLL;
    if (compact === 'wait' || compact === 'sleep' || compact === 'pause') return ActionType.WAIT;
    if (compact === 'extract' || compact === 'gettext' || compact === 'extracttext') return ActionType.EXTRACT;
    if (compact === 'navigate' || compact === 'navigateto' || compact === 'goto') return ActionType.NAVIGATE;
    if (compact === 'pass' || compact === 'success' || compact === 'done' || compact === 'complete') return ActionType.PASS;
    if (compact === 'fail' || compact === 'failure' || compact === 'error' || compact === 'cannotproceed') return ActionType.FAIL;

    return rawType;
}

function parseElementId(value: unknown): number | undefined {
    if (typeof value === 'number' && Number.isFinite(value)) {
        return Math.floor(value);
    }

    if (typeof value === 'string') {
        const normalized = value.trim().toLowerCase();
        if (normalized === 'top' || normalized === 'first') {
            return 0;
        }

        const direct = Number(value);
        if (!Number.isNaN(direct) && Number.isFinite(direct)) {
            return Math.floor(direct);
        }

        const match = value.match(/\d+/);
        if (match?.[0]) {
            return Number(match[0]);
        }
    }

    return undefined;
}
