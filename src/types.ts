export interface PluginSettings {
	tagPageDir: string;
	frontmatterQueryProperty: string;
	nestedSeparator: string;
	bulletedSubItems: boolean;
	includeLines: boolean;
	autoRefresh: boolean;
}

export type TagInfo = Map<string, TagMatchDetail[]>;

export interface TagMatchDetail {
	stringContainingTag: string;
	fileLink: string;
}
