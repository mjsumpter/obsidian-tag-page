export interface PluginSettings {
	tagPageDir: string;
	frontmatterQueryProperty: string;
	bulletedSubItems: boolean;
	includeLines: boolean;
	autoRefresh: boolean;
}

export interface TagInfo {
	fileLink: string;
	tagMatches: string[];
}
