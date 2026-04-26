import { Result, ok, err } from 'neverthrow';
import { ValidationError } from '../errors';

declare const brand: unique symbol;
type Brand<T, B> = T & { readonly [brand]: B };

export type Url = Brand<string, 'Url'>;
export type RunId = Brand<string, 'RunId'>;

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