import { Result, ok, err } from 'neverthrow';
import { ValidationError } from '../errors';

declare const brand: unique symbol;
export type Brand<T, B> = T & { readonly [brand]: B };

export type Url = Brand<string, 'Url'>;
export type RunId = Brand<string, 'RunId'>;
export type ElementId = Brand<number, 'ElementId'>;

export const UrlFactory = {
    create(value: string): Result<Url, ValidationError> {
        if (!value || value.trim() === '') {
            return err(new ValidationError('URL cannot be empty', 'url'));
        }
        try {
            new URL(value);
            return ok(value as Url);
        } catch {
            return err(new ValidationError(`Invalid URL: ${value}`, 'url'));
        }
    },
    unsafe(value: string): Url {
        return value as Url;
    },
};

import { nanoid } from 'nanoid';

export const RunIdFactory = {
    create(): RunId {
        return nanoid() as RunId;
    },
    fromString(value: string): RunId {
        return value as RunId;
    },
};

export const ElementIdFactory = {
    create(value: number): Result<ElementId, ValidationError> {
        if (!Number.isInteger(value) || value < 0) {
            return err(new ValidationError(`Invalid element ID: ${value}`, 'elementId'));
        }
        return ok(value as ElementId);
    },
    unsafe(value: number): ElementId {
        return value as ElementId;
    },
};
