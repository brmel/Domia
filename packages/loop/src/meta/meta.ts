import { metaSince, brandId } from '@domia/contracts';

/** Meta-tools produce outcomes outside any tracer span; stamp a synthetic OutcomeMeta. */
export const syntheticMeta = () => metaSince(new Date().toISOString(), brandId<'TraceId'>('meta'), brandId<'SpanId'>('meta'));
