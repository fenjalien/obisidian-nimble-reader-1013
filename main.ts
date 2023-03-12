import { StateField, EditorState, Transaction, Text, RangeSetBuilder } from '@codemirror/state';
import { DecorationSet, Decoration, EditorView } from '@codemirror/view';
import { App, Plugin, PluginSettingTab, Setting } from 'obsidian';

const WORD_STEM_PERCENTAGE = 0.7;
let fixationStrength = 2;
let saccadesInterval = 0;
let enable = false;

interface NimbleReaderSettings {
  enable: boolean,
  lineHeight: number,
  saccadesColor: string,
  saccadesStyle: string,
  saccadesInterval: number,
  fixationStrength: number,
  fixationEdgeOpacity: number,
}

const DEFAULT_SETTINGS: NimbleReaderSettings = {
  enable: false,
  lineHeight: 1,
  saccadesColor: "",
  saccadesStyle: 'bold-600',
  saccadesInterval: 0,
  fixationStrength: 2,
  fixationEdgeOpacity: 80,
}

function insertString(index: number, str1: string, str2: string) {
  return str1.substring(0, index) + str2 + str1.substring(index);
}

export default class NimbleReaderPlugin extends Plugin {
  settings: NimbleReaderSettings;

  async onload() {
    await this.loadSettings();

    this.registerMarkdownPostProcessor((el, _) => { if (enable) { this.parseElement(el) } });
    this.updateEnable(this.settings.enable);
    this.refreshStyleSettings();
    this.addSettingTab(new NimberReaderSettingTab(this.app, this));
    this.registerEditorExtension(nimbleStateField.extension);

    this.addCommand({
      id: "nimble-reader-1013-toggle",
      name: "Toggle Nimble Reader 1013 On/Off",
      callback: () => this.updateEnable(!this.settings.enable),
      hotkeys: [
        {
          modifiers: ['Alt'],
          key: "W"
        }
      ]
    })

    console.log("Loaded Nimble Reader 1013 Plugin");
  }

  onunload() {

  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  parseElement(element: Element) {
    for (const el of Array.from(element.children)) {
      if (!el.className.contains("math")) {
        this.parseElement(el);
      }
    }
    for (let node of Array.from(element.childNodes)) {
      if (node.nodeType === Node.TEXT_NODE && node.nodeValue?.length) {
        const nrSpan = document.createElement("nr-span");
        let text = node.nodeValue;
        for (const { bold, edge } of [...processText(node.nodeValue)].reverse()) {
          if (edge) {
            text = insertString(edge.to, text, `</nr-edge>`);
            text = insertString(edge.from, text, `<nr-edge>`);
          }
          if (bold) {
            text = insertString(bold.to, text, `</nr-bold>`);
            text = insertString(bold.from, text, `<nr-bold>`);
          }
        }
        nrSpan.innerHTML = text;
        if (nrSpan.childElementCount === 0) return;
        element.replaceChild(nrSpan, node);
      }
    }
  }

  async refreshStyleSettings() {
    saccadesInterval = this.settings.saccadesInterval;
    fixationStrength = this.settings.fixationStrength;
    document.body.style.setProperty("--fixation-edge-opacity", this.settings.fixationEdgeOpacity.toString() + "%");
    document.body.style.setProperty("--nr-line-height", this.settings.lineHeight.toString());

    let bold, lineStyle;
    if (this.settings.saccadesStyle.contains("Bold")) {
      bold = this.settings.saccadesStyle.split("-")[1];
      lineStyle = "";
    } else {
      lineStyle = this.settings.saccadesStyle.split("-")[0];
      bold = "";
    }
    document.body.style.setProperty("--nr-boldness", bold);
    document.body.style.setProperty("--nr-line-style", lineStyle);
    document.body.setAttribute("fixation-strength", this.settings.fixationStrength.toString());
    document.body.setAttribute("saccades-interval", this.settings.saccadesInterval.toString());
    await this.saveSettings();
  }

  async updateEnable(value: boolean) {
    this.settings.enable = value;
    enable = value;
    await this.saveSettings();
  }
}


function processDecos(doc: Text): DecorationSet {
  if (!enable) return Decoration.none;
  let builder = new RangeSetBuilder<Decoration>();
  for (const { bold, edge } of processText(doc.sliceString(0, doc.length))) {
    if (bold) {
      builder.add(bold.from, bold.to, Decoration.mark({ tagName: "nr-bold" }))
    }
    if (edge) {
      builder.add(edge.from, edge.to, Decoration.mark({ tagName: "nr-edge" }))
    }
  }
  return builder.finish();
}

const nimbleStateField = StateField.define<DecorationSet>({
  create(state: EditorState) {
    return processDecos(state.doc);
  },

  update(decos: DecorationSet, transaction: Transaction) {
    if (transaction.docChanged) {
      // TODO: instead of regenerating the decorations, regenerate only those changed
      //   let lineSet = new Set<number>();
      //   const doc = transaction.state.doc;
      //   transaction.changes.iterChangedRanges((fromA, toA, fromB, toB) => {
      //     const from = Math.min(fromA, fromB);
      //     const to = Math.max(toA, toB);
      //     if (from === to) {
      //       lineSet.add(doc.lineAt(from).number)
      //       return;
      //     }
      //     const lineFrom = doc.lineAt(from).number;
      //     lineSet.add(lineFrom)
      //     const lineTo = doc.lineAt(to).number;
      //     lineSet.add(lineTo)
      //     for (let l = lineFrom + 1; l < lineTo; l += 1) {
      //       lineSet.add(l)
      //     }
      //   });
      //   let lines = Array.from(lineSet).sort((a, b) => a - b);
      //   console.log(lines);
      //   decos.bold = decos.bold.map(transaction.changes)
      //   decos.edge = decos.edge.map(transaction.changes)
      //   decos.fixation = decos.fixation.map(transaction.changes)
      // }
      return processDecos(transaction.state.doc);
    }

    return decos;
  },
  provide: f => EditorView.decorations.from(f),
});

function* processText(text: string) {
  for (const [i, match] of Array.from(text.matchAll(/\p{L}+/gu)).entries()) {
    const offset = match.index!;
    const length = match[0].length;
    if (i % (saccadesInterval + 1) === 0) {
      const stem = length > 3 ? Math.round(length * WORD_STEM_PERCENTAGE) : length;
      let fixation = Math.min(Math.ceil(stem / 4) * fixationStrength, stem);
      yield {
        bold: { from: offset, to: offset + fixation },
        edge: fixation === length ? null : { from: offset + fixation, to: offset + length }
      }
    } else {
      yield {
        bold: null,
        edge: { from: offset, to: offset + length }
      }
    }
  }
}


class NimberReaderSettingTab extends PluginSettingTab {
  plugin: NimbleReaderPlugin;

  constructor(app: App, plugin: NimbleReaderPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;

    containerEl.empty();

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
          .setValue(this.plugin.settings.saccadesStyle)
          .onChange(value => {
            this.plugin.settings.saccadesStyle = value;
            this.plugin.refreshStyleSettings();
          })
      )

    new Setting(containerEl)
      .setName("The changes to the following options requires the file to be re-rendered. This can be done by making an edit to the file, closing and reopening the file, disabling and enabling the plugin, or by reloading Obsidian.")

    new Setting(containerEl)
      .setName('Enable')
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
  }
}
