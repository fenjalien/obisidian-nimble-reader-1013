import { StateEffect, StateField, EditorState, Transaction, Range, Text, RangeSet, Line, Prec } from '@codemirror/state';
import { DecorationSet, Decoration, EditorView } from '@codemirror/view';
import { App, Hotkey, Plugin, PluginSettingTab, Setting } from 'obsidian';

// Remember to rename these classes and interfaces!

const MAX_FIXATIONS = 4;
const FIXATION_LOWER_BOUND = 0;
const WORD_STEM_PERCENTAGE = 0.7;

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
  str1 = str1.substring(0, index) + str2 + str1.substring(index);
}

export default class NimbleReaderPlugin extends Plugin {
  settings: NimbleReaderSettings;

  async onload() {
    await this.loadSettings();

    this.registerMarkdownPostProcessor((el, ctx) => this.parseElement(el));
    console.log("loaded jiffy");
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
  }

  onunload() {

  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  parseElement(node: Node) {
    if (node.nodeType === Node.TEXT_NODE && node.nodeValue?.length) {
      const brSpan = document.createElement("br-span");
      let text = node.nodeValue;
      for (const { bold, edge, fixations } of [...processText(node.nodeValue)].reverse()) {
        if (edge) {
          insertString(edge.to, text, `</br-edge>`);
          insertString(edge.from, text, `<br-edge>`);
        }
        for (const fix of fixations.reverse()) {
          insertString(fix.to, text, `</br-fixation>`)
          insertString(fix.from, text, `<br-fixation fixation-strength="${fix.f}">`)
        }
        insertString(bold.to, text, `</br-bold>`);
        insertString(bold.from, text, `<br-bold>`);
      }
      if (brSpan.childElementCount === 0) return;
      node.parentElement!.replaceChild(brSpan, node);
    }
    if (node.hasChildNodes()) node.childNodes.forEach((n) => this.parseNodes(n));
  }

  refreshStyleSettings() {
    document.body.style.setProperty("--fixation-edge-opacity", this.settings.fixationEdgeOpacity.toString() + "%");
    document.body.style.setProperty("--br-line-height", this.settings.lineHeight.toString());

    let bold, lineStyle;
    if (this.settings.saccadesStyle.contains("Bold")) {
      bold = this.settings.saccadesStyle.split("-")[1];
      lineStyle = "";
    } else {
      lineStyle = this.settings.saccadesStyle.split("-")[0];
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
          .setValue(this.plugin.settings.saccadesStyle)
          .onChange(value => {
            this.plugin.settings.saccadesStyle = value;
            this.plugin.refreshStyleSettings();
          })
      )
  }
}

interface NimbleDecorationSets {
  bold: DecorationSet,
  edge: DecorationSet,
  fixation: DecorationSet,
}


const boldMark: Decoration = Decoration.mark({ tagName: "br-bold" });
const edgeMark: Decoration = Decoration.mark({ tagName: "br-edge" });
const fixationMarks = [1, 2, 3, 4].map(i => Decoration.mark({ tagName: "br-fixation", attributes: { "fixation-strength": i.toString() } }));

const nimbleStateField = StateField.define<NimbleDecorationSets>({
  create(state: EditorState) {
    return processDecos(state.doc);
  },

  update(decos: NimbleDecorationSets, transaction: Transaction) {
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
  provide: f => [
    Prec.lowest(EditorView.decorations.from(f, (v) => v.bold)),
    EditorView.decorations.from(f, (v) => v.fixation),
    EditorView.decorations.from(f, (v) => v.edge)
  ],
});

function processDecos(doc: Text) {
  let boldDecos: Range<Decoration>[] = [];
  let edgeDecos: Range<Decoration>[] = [];
  let fixationDecos: Range<Decoration>[] = [];
  for (const { bold, edge, fixations } of processText(doc.sliceString(0, doc.length))) {
    boldDecos.push(boldMark.range(bold.from, bold.to))
    if (edge) {
      edgeDecos.push(edgeMark.range(edge.from, edge.to))
    }
    fixationDecos.push(...fixations.map(fix => fixationMarks[fix.f].range(fix.from, fix.to)))
  }
  return {
    bold: RangeSet.of(boldDecos),
    edge: RangeSet.of(edgeDecos),
    fixation: RangeSet.of(fixationDecos)
  };
}

function* processText(text: string) {
  for (const match of text.matchAll(/\p{L}+/gu)) {
    const { bold, edge } = processWord(match[0], match.index!);
    yield {
      bold,
      edge,
      fixations: [...processFixations(match[0].slice(0, bold.to - bold.from), bold.from)]
    }
  }
}

function processWord(text: string, offset: number) {
  const stem = text.length > 3 ? Math.round(text.length * WORD_STEM_PERCENTAGE) : text.length;
  return {
    bold: { from: offset, to: offset + stem },
    edge: stem === text.length ? null : { from: offset + stem, to: offset + text.length }
  }
}

function* processFixations(text: string, offset: number) {
  const computedMaxFixations = text.length >= MAX_FIXATIONS ? MAX_FIXATIONS : text.length;
  const fixationWidth = Math.ceil(text.length / computedMaxFixations);
  if (fixationWidth === FIXATION_LOWER_BOUND) {
    return fixationMarks[0].range(offset, offset + text.length);
  } else {
    for (let f = 0; f < computedMaxFixations; f += 1) {
      const from = offset + f * fixationWidth;
      const to = Math.min(from + fixationWidth, offset + text.length);
      // if text.length is 5 from becomes greater than to so just ignore it
      if (from < to) {
        yield { from, to, f };
        // return;
      }

    }
  }
}
