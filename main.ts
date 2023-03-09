import { App, Editor, MarkdownPostProcessorContext, MarkdownView, Modal, Notice, Plugin, PluginSettingTab, Setting } from 'obsidian';

// Remember to rename these classes and interfaces!

interface MyPluginSettings {
	enable: boolean,
	lineHeight: number,
	saccadesColor: string,
	saccadesStyle: string,
	saccadesInterval: number,
	fixationStrength: number,
	fixationEdgeOpacity: number,
	maxFixationParts: number,
	fixationLowerBound: number,
	brWordStemPercentage: number,
}

const DEFAULT_SETTINGS: MyPluginSettings = {
	enable: false,
	lineHeight: 1,
	saccadesColor: "",
	saccadesStyle: 'bold-600',
	saccadesInterval: 0,
	fixationStrength: 2,
	fixationEdgeOpacity: 80,
	maxFixationParts: 4,
	fixationLowerBound: 0,
	brWordStemPercentage: 0.7
}

export default class MyPlugin extends Plugin {
	settings: MyPluginSettings;

	async onload() {
		await this.loadSettings();

		this.registerMarkdownPostProcessor((el, ctx) => this.parseElement(el));
		console.log("loaded jiffy");
		this.refreshStyleSettings();
		this.addSettingTab(new SampleSettingTab(this.app, this));

		// this.addCommand({
		// 	id: "jiffy-toggle",
		// 	name: "Toggle Jiffy On/Off",
		// 	callback: () => {
		// 		this.isOn = !this.isOn;
		// 		document.body.setAttribute('br-mode', this.isOn ? 'on' : 'off');
		// 	}
		// })
	}

	onunload() {

	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	parseElement(element: HTMLElement) {
		console.log("firing");
		this.parseNodes(element);
	}

	parseNodes(node: Node) {
		if (node.nodeType === Node.TEXT_NODE && node.nodeValue?.length) {
			const brSpan = document.createElement("br-span");
			brSpan.innerHTML = this.highlightText(node.nodeValue);
			if (brSpan.childElementCount === 0) return;

			// to avoid duplicates of brSpan, check it if
			// this current textNode has a left sibling of br span
			// we know that is possible because
			// we will specifically insert the br-span
			// on the left of a text node, and keep
			// the text node alive later. so if we get to
			// this text node again. that means that the
			// text node was updated and the br span is now stale
			// so remove that if exist
			// if (node.previousSibling?.nodeName === 'BR-SPAN') {
			// 	node.parentElement!.removeChild(node.previousSibling);
			// }

			// dont replace for now, cause we're keeping it alive
			// below
			node.parentElement!.replaceChild(brSpan, node);

			// keep the textNode alive in the dom, but
			// empty it's contents
			// and insert the brSpan just before it
			// we need the text node alive because
			// youtube has some reference for it internally
			// and we want to listen to it when it changes
			// node.parentElement!.insertBefore(brSpan, node);
			// node.textContent = '';
		}

		if (node.hasChildNodes()) node.childNodes.forEach((n) => this.parseNodes(n));
	}

	highlightText(sentenceText: string) {
		return sentenceText.replace(/\p{L}+/gu, (word) => {
			const { length } = word;

			const brWordStemWidth = length > 3 ? Math.round(length * this.settings.brWordStemPercentage) : length;

			const firstHalf = word.slice(0, brWordStemWidth);
			const secondHalf = word.slice(brWordStemWidth);
			const htmlWord = `<br-bold>${this.makeFixations(firstHalf)}</br-bold>${secondHalf.length ? `<br-edge>${secondHalf}</br-edge>` : ''}`;
			return htmlWord;
		});
	}

	makeFixations(textContent: string) {
		const COMPUTED_MAX_FIXATION_PARTS = textContent.length >= this.settings.maxFixationParts ? this.settings.maxFixationParts : textContent.length;

		const fixationWidth = Math.ceil(textContent.length * (1 / COMPUTED_MAX_FIXATION_PARTS));

		if (fixationWidth === this.settings.fixationLowerBound) {
			return `<br-fixation fixation-strength="1">${textContent}</br-fixation>`;
		}

		const fixationsSplits = new Array(COMPUTED_MAX_FIXATION_PARTS).fill(null).map((item, index) => {
			const wordStartBoundary = index * fixationWidth;
			const wordEndBoundary = wordStartBoundary + fixationWidth > textContent.length ? textContent.length : wordStartBoundary + fixationWidth;

			return `<br-fixation fixation-strength="${index + 1}">${textContent.slice(wordStartBoundary, wordEndBoundary)}</br-fixation>`;
		});

		return fixationsSplits.join('');
	}

	refreshStyleSettings() {
		document.body.style.setProperty("--fixation-edge-opacity", this.settings.fixationEdgeOpacity.toString() + "%");
		document.body.style.setProperty("--br-line-height", this.settings.lineHeight.toString());

		let bold, lineStyle;
		if (this.settings.saccadesStyle.contains("bold")) {
			[, bold] = this.settings.saccadesStyle.split("-");
			lineStyle = "";
		} else {
			[lineStyle] = this.settings.saccadesStyle.split("-");
			bold = "";
		}
		document.body.style.setProperty("--br-boldness", bold);
		document.body.style.setProperty("--br-line-style", lineStyle);
		document.body.setAttribute("saccades-color", this.settings.saccadesColor);
		document.body.setAttribute("fixation-strength", this.settings.fixationStrength.toString());
		document.body.setAttribute("saccades-interval", this.settings.saccadesInterval.toString());
		this.saveSettings();
	}

	async updateEnable(value: boolean) {
		this.settings.enable = value;
		document.body.setAttribute('br-mode', value ? 'on' : 'off');
		await this.saveSettings();
	}
}


class SampleSettingTab extends PluginSettingTab {
	plugin: MyPlugin;

	constructor(app: App, plugin: MyPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();

		new Setting(containerEl)
			.setName('Enable')
			.setDesc('Reading mode')
			.addToggle((c) =>
				c
					.setValue(this.plugin.settings.enable)
					.onChange((value) => this.plugin.updateEnable(value))
			);
		new Setting(containerEl)
			.setName('Saccades Interval')
			.addSlider(c =>
				c
					.setValue(this.plugin.settings.saccadesInterval)
					.setLimits(0, 3, 1)
					.setDynamicTooltip()
					.onChange(value => {
						this.plugin.settings.saccadesInterval = value;
						this.plugin.refreshStyleSettings();
					})
					.showTooltip()
			);
		new Setting(containerEl)
			.setName('Fixation Strength')
			.addSlider(c =>
				c
					.setValue(this.plugin.settings.fixationStrength)
					.setLimits(1, 4, 1)
					.setDynamicTooltip()
					.onChange(value => {
						this.plugin.settings.fixationStrength = value;
						this.plugin.refreshStyleSettings();
					})
					.showTooltip()
			);
		new Setting(containerEl)
			.setName('Fixation Edge Opacity')
			.addSlider(c =>
				c
					.setValue(this.plugin.settings.fixationEdgeOpacity)
					.setLimits(0, 100, 20)
					.setDynamicTooltip()
					.onChange(value => {
						this.plugin.settings.fixationEdgeOpacity = value;
						this.plugin.refreshStyleSettings();
					})
					.showTooltip()
			);
		new Setting(containerEl)
			.setName("Saccades Color")
			.addDropdown(c =>
				c
					.addOptions({
						'': 'Original',
						'light': 'Light',
						'light-100': 'Light-100',
						'dark': 'Dark',
						'dark-100': 'Dark-100'
					})
					.setValue(this.plugin.settings.saccadesColor)
					.onChange(value => {
						this.plugin.settings.saccadesColor = value;
						this.plugin.refreshStyleSettings();
					})
			)

		new Setting(containerEl)
			.setName("Saccades Styles")
			.addDropdown(c =>
				c
					.addOptions({
						'Bold-400': 'Bold-400',
						'Bold-500': 'Bold-500',
						'Bold-600': 'Bold-600',
						'Bold-700': 'Bold-700',
						'Bold-800': 'Bold-800',
						'Bold-900': 'Bold-900',
						'Solid-line': 'Solid-line',
						'Dashed-line': 'Dashed-line',
						'Dotted-line': 'Dotted-line',
					})
					.setValue(this.plugin.settings.saccadesColor)
					.onChange(value => {
						this.plugin.settings.saccadesColor = value;
						this.plugin.refreshStyleSettings();
					})
			)

		new Setting(containerEl)
					.setName("Reset")
					.addButton(c => 
						c.onClick((_) => {this.plugin.settings = DEFAULT_SETTINGS})
						)

	}
}
