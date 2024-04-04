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

export interface TagMatchDetail {
	stringContainingTag: string;
	fileLink: string;
}
