declare const __pluginNameBrand: unique symbol;
export type PluginName = string & { readonly [__pluginNameBrand]: void };
