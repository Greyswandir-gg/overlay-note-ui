const {
  Plugin, Notice, setIcon, MarkdownView,
  PluginSettingTab, Setting, SuggestModal, Modal
} = require('obsidian');

/*
    Settings schema:
    {
      menus: MenuPreset[],           // Array of menu presets
      defaultMenuId?: string,        // Default menu ID
      isCollapsed: boolean           // Whether overlay is collapsed
    }

    MenuPreset = {
      id: string,                    // Unique menu ID
      name: string,                  // Display name
      layout: ButtonItem[],          // Array of button items
      orientation: 'horizontal'|'vertical', // Menu orientation
      position: 'top-right'|'top-left'|'bottom-right'|'bottom-left', // Overlay position
      buttonSize: 'sm'|'md'|'lg',    // Button size
      toggleButton: ButtonItem       // Toggle button configuration
    }

    ButtonItem = {
      type: 'button'|'spacer',       // Item type: button or spacer
      id?: string,                   // Command ID for buttons
      label?: string,                // Button label text
      icon?: string,                 // Lucide icon name
      color?: string,                // Text color (hex)
      bg?: string                    // Background color (hex)
    }

    ButtonRow = ButtonItem[];        // Row of buttons
  */

const DEFAULT_LAYOUT = [
  { type: 'button', id: 'command-palette:open', label: 'Commands', icon: 'command' },
  { type: 'button', id: 'markdown:toggle-preview', label: 'Mode', icon: 'eye' },
  { type: 'button', id: 'workspace:toggle-pin', label: 'Pin', icon: 'pin' }
];

const DEFAULT_MENU = {
  layout: DEFAULT_LAYOUT,
  orientation: 'horizontal',
  position: 'top-right',
  buttonSize: 'md',
  toggleButton: { type: 'button', id: 'overlay-note-ui:toggle-overlay', label: 'Toggle', icon: 'chevron-up' }
};

const DEFAULT_SETTINGS = {
  menus: [{
    id: 'default',
    name: 'Стандарт',
    layout: DEFAULT_LAYOUT,
    orientation: 'horizontal',
    position: 'top-right',
    buttonSize: 'md',
    toggleButton: { type: 'button', id: 'overlay-note-ui:toggle-overlay', label: 'Toggle', icon: 'chevron-up' }
  }],
  defaultMenuId: 'default',
  isCollapsed: false
};

function isArray(v) { return Array.isArray(v); }
function clone(v) { return JSON.parse(JSON.stringify(v)); }

function listAllCommands(app) {
  try {
    if (typeof app.commands.listCommands === 'function') {
      const arr = app.commands.listCommands();
      if (arr && arr.length) return arr;
    }
  } catch {}
  const obj = (app.commands && app.commands.commands) || {};
  return Object.values(obj);
}

class CommandPickerModal extends SuggestModal {
  constructor(app, onChoose) {
    super(app);
    this.onChooseCallback = onChoose;
    this.setPlaceholder('Find command…');
    const cmds = listAllCommands(app).map(c => ({
      id: c.id, name: c.name || c.id, icon: c.icon
    }));
    // Filter out commands without IDs
    this.commands = cmds.filter(c => !!c.id);
  }
  getSuggestions(query) {
    const q = (query || '').toLowerCase().trim();
    if (!q) return this.commands.slice(0, 200);
    return this.commands
      .filter(c => c.name.toLowerCase().includes(q) || c.id.toLowerCase().includes(q))
      .slice(0, 200);
  }
  renderSuggestion(s, el) {
    el.empty();
    const title = el.createDiv({ text: s.name });
    title.style.fontWeight = '600';
    const idEl = el.createDiv({ text: s.id });
    idEl.style.opacity = '0.7';
    idEl.style.fontSize = '12px';
  }
  onChooseSuggestion(s) { this.onChooseCallback?.(s); }
}

class MenuPickerModal extends SuggestModal {
  constructor(app, menus, onChoose) {
    super(app);
    this.menus = menus;
    this.onChooseCb = onChoose;
    this.setPlaceholder('Выберите меню…');
  }
  getSuggestions(q) {
    const s = (q || '').toLowerCase();
    return this.menus.filter(m => m.name.toLowerCase().includes(s) || m.id.toLowerCase().includes(s));
  }
  renderSuggestion(m, el) {
    el.createDiv({ text: m.name, cls: 'mod-label' });
    el.createDiv({ text: m.id, cls: 'mods' });
  }
  onChooseSuggestion(m) { this.onChooseCb?.(m); }
}

class ButtonEditorModal extends Modal {
  constructor(app, item, onSave) {
    super(app);
    this.item = clone(item || { type: 'button' });
    this.onSave = onSave;
  }
  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl('h3', { text: 'Button Settings' });

    // Type
    const typeSetting = new Setting(contentEl)
      .setName('Element Type')
      .addDropdown(d => d
        .addOptions({ 'button': 'Button', 'spacer': 'Spacer' })
        .setValue(this.item.type || 'button')
        .onChange(v => {
          this.item.type = v;
          bodyEl.style.display = v === 'button' ? '' : 'none';
        })
      );

    const bodyEl = contentEl.createDiv();

    // Command
    const cmdSet = new Setting(bodyEl)
      .setName('Command')
      .setDesc('Select command for button');

    const cmdInput = cmdSet.addText(t => t
      .setPlaceholder('command id')
      .setValue(this.item.id || '')
      .onChange(v => this.item.id = v.trim())
    );

    cmdSet.addExtraButton(b => b
      .setIcon('search')
      .setTooltip('Select from list')
      .onClick(() => new CommandPickerModal(this.app, (cmd) => {
        this.item.id = cmd.id;
        if (!this.item.label) this.item.label = cmd.name;
        cmdInput.setValue(this.item.id);
        if (labelInput) labelInput.setValue(this.item.label || '');
      }).open())
    );

    // Label
    const labelSet = new Setting(bodyEl).setName('Label');
    const labelInput = labelSet.addText(t => t
      .setPlaceholder('Button text')
      .setValue(this.item.label || '')
      .onChange(v => this.item.label = v)
    );

    // Icon
    const iconSet = new Setting(bodyEl).setName('Icon (Lucide)');
    const iconPreview = iconSet.controlEl.createSpan();
    if (this.item.icon) { try { setIcon(iconPreview, this.item.icon); } catch {} }
    iconSet.addText(t => t
      .setPlaceholder('e.g.: command, pin, eye')
      .setValue(this.item.icon || '')
      .onChange(v => {
        this.item.icon = v.trim() || undefined;
        iconPreview.empty();
        if (this.item.icon) try { setIcon(iconPreview, this.item.icon); } catch {}
      })
    );

    // Colors
    const colorSet = new Setting(bodyEl).setName('Text Color');
    colorSet.addColorPicker(c => c
      .setValue(this.item.color || '#ffffff')
      .onChange(v => this.item.color = v || undefined)
    ).addText(t => t
      .setPlaceholder('#rrggbb or empty')
      .setValue(this.item.color || '')
      .onChange(v => this.item.color = (v.trim() || undefined))
    );

    const bgSet = new Setting(bodyEl).setName('Background Color');
    bgSet.addColorPicker(c => c
      .setValue(this.item.bg || '#3a3a3a')
      .onChange(v => this.item.bg = v || undefined)
    ).addText(t => t
      .setPlaceholder('#rrggbb or empty')
      .setValue(this.item.bg || '')
      .onChange(v => this.item.bg = (v.trim() || undefined))
    );

    // Control buttons
    new Setting(contentEl)
      .addButton(b => b.setButtonText('Save')
        .setCta()
        .onClick(() => { this.onSave?.(this.item); this.close(); }))
      .addButton(b => b.setButtonText('Cancel')
        .onClick(() => this.close()));
  }
}
class LayoutEditorModal extends Modal {
  constructor(app, layout, onSave) {
    super(app);
    this.layout = clone(layout || []);
    this.onSave = onSave;
    this.dragIndex = null;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl('h3', { text: 'Edit Layout' });

    const layoutContainer = contentEl.createDiv({ cls: 'layout-editor' });

    const refreshLayout = () => {
      layoutContainer.empty();

      this.layout.forEach((item, itemIdx) => {
        const itemEl = layoutContainer.createDiv({ cls: 'layout-item', attr: { draggable: 'true' } });

        const dragHandle = itemEl.createSpan({ cls: 'layout-item__handle', text: '⋮⋮' });
        dragHandle.setAttribute('aria-label', 'Переместить');

        if (item.type === 'spacer') {
          itemEl.createEl('span', { text: 'Spacer' });
        } else {
          const btnText = item.label || item.id || 'Button';
          itemEl.createEl('span', { text: btnText });
        }

        // Edit item
        const editBtn = itemEl.createEl('button', { text: 'Edit' });
        editBtn.addEventListener('click', () => {
          new ButtonEditorModal(this.app, item, (newItem) => {
            this.layout[itemIdx] = newItem;
            refreshLayout();
          }).open();
        });

        // Delete item
        const delBtn = itemEl.createEl('button', { text: 'Delete' });
        delBtn.addEventListener('click', () => {
          this.layout.splice(itemIdx, 1);
          refreshLayout();
        });

        itemEl.addEventListener('dragstart', (e) => {
          this.dragIndex = itemIdx;
          itemEl.classList.add('is-dragging');
          e.dataTransfer?.setData('text/plain', `${itemIdx}`);
          e.dataTransfer?.setDragImage(dragHandle, 4, 4);
        });

        itemEl.addEventListener('dragover', (e) => {
          e.preventDefault();
          itemEl.classList.add('is-dragover');
        });

        itemEl.addEventListener('dragleave', () => {
          itemEl.classList.remove('is-dragover');
        });

        itemEl.addEventListener('drop', (e) => {
          e.preventDefault();
          itemEl.classList.remove('is-dragover');
          const from = this.dragIndex;
          const to = itemIdx;
          if (from === null || from === undefined || from === to) return;
          const [moved] = this.layout.splice(from, 1);
          this.layout.splice(to, 0, moved);
          this.dragIndex = null;
          refreshLayout();
        });

        itemEl.addEventListener('dragend', () => {
          this.dragIndex = null;
          itemEl.classList.remove('is-dragging');
        });
      });

      // Add item
      const addItem = layoutContainer.createEl('button', { text: '+ Add Item' });
      addItem.addEventListener('click', () => {
        this.layout.push({ type: 'button' });
        refreshLayout();
      });
    };

    refreshLayout();

    // Control buttons
    new Setting(contentEl)
      .addButton(b => b.setButtonText('Save')
        .setCta()
        .onClick(() => { this.onSave?.(this.layout); this.close(); }))
      .addButton(b => b.setButtonText('Cancel')
        .onClick(() => this.close()));
  }
}

class OverlayNoteUISettingTab extends PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display() {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.classList.add('overlay-note-ui-settings');
    containerEl.createEl('h2', { text: 'Overlay Note UI' });

    const makeCard = (title, desc) => {
      const card = containerEl.createDiv({ cls: 'onu-card' });
      const header = card.createDiv({ cls: 'onu-card__header' });
      header.createDiv({ cls: 'onu-card__title', text: title });
      if (desc) header.createDiv({ cls: 'onu-card__desc', text: desc });
      return card.createDiv({ cls: 'onu-card__body' });
    };

    // Default menu selector
    const defaultBody = makeCard('Меню по умолчанию', 'Выберите пресет, который будет подниматься при запуске.');
    const defaultWrap = defaultBody.createDiv({ cls: 'onu-field-row' });
    const refreshDefault = () => {
      defaultWrap.empty();
      defaultWrap.createEl('label', { text: 'Меню:' });
      const sel = defaultWrap.createEl('select');
      this.plugin.settings.menus.forEach(menu => {
        sel.add(new Option(menu.name, menu.id));
      });
      sel.value = this.plugin.settings.defaultMenuId || '';
      sel.addEventListener('change', async () => {
        this.plugin.settings.defaultMenuId = sel.value;
        await this.plugin.saveSettings();
      });
    };
    refreshDefault();

    // Menus list
    const menusBody = makeCard('Меню', 'Управляйте пресетами расположения и составом кнопок.');
    const menusWrap = menusBody.createDiv({ cls: 'onu-stack' });
    const refreshMenus = () => {
      menusWrap.empty();
      this.plugin.settings.menus.forEach((menu, menuIdx) => {
        const menuBox = menusWrap.createDiv({ cls: 'onu-menu-card', attr: { 'data-menu-idx': menuIdx } });
        const info = menuBox.createDiv({ cls: 'onu-menu-card__header' });
        info.createDiv({ cls: 'onu-menu-card__title', text: menu.name });
        info.createDiv({ cls: 'onu-menu-card__subtitle', text: menu.id });

        const ctrl = menuBox.createDiv({ cls: 'onu-menu-card__body' });

        // Menu settings
        const menuSettings = ctrl.createEl('div', { cls: 'menu-settings' });

        // ID
        const idSet = menuSettings.createEl('div', { cls: 'onu-field-row' });
        idSet.createEl('label', { text: 'ID:' });
        const idInput = idSet.createEl('input', { type: 'text', value: menu.id });
        idInput.addEventListener('change', async () => {
          this.plugin.settings.menus[menuIdx].id = idInput.value.trim();
          await this.plugin.saveSettings();
        });

        // Name
        const nameSet = menuSettings.createEl('div', { cls: 'onu-field-row' });
        nameSet.createEl('label', { text: 'Name:' });
        const nameInput = nameSet.createEl('input', { type: 'text', value: menu.name });
        nameInput.addEventListener('change', async () => {
          this.plugin.settings.menus[menuIdx].name = nameInput.value.trim();
          await this.plugin.saveSettings(); refreshMenus(); refreshDefault();
        });

        // Position
        const posWrap = menuSettings.createEl('div', { cls: 'onu-field-row' });
        posWrap.createEl('label', { text: 'Позиция:' });
        const posSel = posWrap.createEl('select');
        posSel.add(new Option('Top Left', 'top-left'));
        posSel.add(new Option('Top Center', 'top-center'));
        posSel.add(new Option('Top Right', 'top-right'));
        posSel.add(new Option('Bottom Left', 'bottom-left'));
        posSel.add(new Option('Bottom Center', 'bottom-center'));
        posSel.add(new Option('Bottom Right', 'bottom-right'));
        posSel.add(new Option('Left Center', 'left-center'));
        posSel.add(new Option('Right Center', 'right-center'));
        posSel.add(new Option('Free (Drag)', 'free'));
        posSel.value = menu.position || 'top-right';
        posSel.addEventListener('change', async () => {
          this.plugin.settings.menus[menuIdx].position = posSel.value;
          await this.plugin.saveSettings(); this.plugin.update();
        });

        // Size
        const sizeWrap = menuSettings.createEl('div', { cls: 'onu-field-row' });
        sizeWrap.createEl('label', { text: 'Размер:' });
        const sizeSel = sizeWrap.createEl('select');
        sizeSel.add(new Option('Small', 'sm'));
        sizeSel.add(new Option('Medium', 'md'));
        sizeSel.add(new Option('Large', 'lg'));
        sizeSel.value = menu.buttonSize || 'md';
        sizeSel.addEventListener('change', async () => {
          this.plugin.settings.menus[menuIdx].buttonSize = sizeSel.value;
          await this.plugin.saveSettings(); this.plugin.update();
        });

        // Orientation
        const orientWrap = menuSettings.createEl('div', { cls: 'onu-field-row' });
        orientWrap.createEl('label', { text: 'Ориентация:' });
        const orientSel = orientWrap.createEl('select');
        orientSel.add(new Option('Horizontal', 'horizontal'));
        orientSel.add(new Option('Vertical', 'vertical'));
        orientSel.value = menu.orientation || 'horizontal';
        orientSel.addEventListener('change', async () => {
          this.plugin.settings.menus[menuIdx].orientation = orientSel.value;
          await this.plugin.saveSettings(); this.plugin.update();
        });

        // Edit toggle button
        const editToggle = menuSettings.createEl('button', { text: 'Edit Toggle' });
        editToggle.addEventListener('click', () => {
          new ButtonEditorModal(this.app, menu.toggleButton, async (item) => {
            this.plugin.settings.menus[menuIdx].toggleButton = item;
            await this.plugin.saveSettings();
            this.plugin.update();
          }).open();
        });

        // Edit layout
        const editLayout = menuSettings.createEl('button', { text: 'Edit Layout', cls: 'onu-ghost-btn' });
        editLayout.addEventListener('click', () => {
          this.openLayoutEditor(menuIdx);
        });

        // Add the openLayoutEditor method
        this.openLayoutEditor = (menuIdx) => {
          const menu = this.plugin.settings.menus[menuIdx];
          if (!menu) return;

          const modal = new LayoutEditorModal(this.app, menu.layout, (newLayout) => {
            this.plugin.settings.menus[menuIdx].layout = newLayout;
            this.plugin.saveSettings();
            this.plugin.update();
          });
          modal.open();
        };
        // Delete menu
        const del = menuSettings.createEl('button', { text: 'Delete', cls: 'onu-danger-btn' });
        del.addEventListener('click', async () => {
          if (this.plugin.settings.menus.length <= 1) {
            new Notice('Cannot delete the last menu');
            return;
          }
          this.plugin.settings.menus.splice(menuIdx, 1);
          await this.plugin.saveSettings(); refreshMenus(); refreshDefault(); this.plugin.update();
        });
      });

      // Add new menu
      const addMenu = menusWrap.createDiv({ cls: 'onu-menu-card onu-menu-card--add' });
      const ctrl = addMenu.createDiv({ cls: 'onu-menu-card__body' });
      const btn = ctrl.createEl('button', { text: 'New Menu', cls: 'onu-primary-btn' });
      btn.addEventListener('click', async () => {
        const newId = `menu-${Date.now()}`;
        this.plugin.settings.menus.push({
          id: newId,
          name: 'New Menu',
          layout: clone(DEFAULT_LAYOUT),
          orientation: 'horizontal',
          position: 'top-right',
          buttonSize: 'md',
          toggleButton: clone(DEFAULT_MENU.toggleButton)
        });
        await this.plugin.saveSettings(); refreshMenus(); refreshDefault(); this.plugin.update();
      });
    };

    refreshMenus();

    // JSON Export/Import (for advanced users)
    const jsonBody = makeCard('Экспорт/импорт', 'Для продвинутых: редактирование JSON текущих пресетов.');
    const ta = jsonBody.createEl('textarea', { cls: 'overlay-note-ui-json-editor' });
    const refreshTA = () => ta.value = JSON.stringify(this.plugin.settings.menus, null, 2);
    refreshTA();

    new Setting(jsonBody)
      .addButton(b => b.setButtonText('Copy JSON')
        .onClick(async () => {
          try { await navigator.clipboard.writeText(ta.value); new Notice('Copied'); }
          catch { new Notice('Failed to copy'); }
        }))
      .addButton(b => b.setButtonText('Import JSON')
        .setCta()
        .onClick(async () => {
          try {
            const parsed = JSON.parse(ta.value);
            if (!isArray(parsed)) throw new Error('Expected array of menus');
            // Validate menus
            for (const menu of parsed) {
              if (!menu.layout || !isArray(menu.layout)) throw new Error('Invalid menu layout');
            }
            this.plugin.settings.menus = parsed;
            await this.plugin.saveSettings(); refreshMenus(); this.plugin.update();
            new Notice('Imported new menus configuration');
          } catch (e) {
            new Notice('JSON Error: ' + e.message);
          }
        }));

  }
}

class OverlayNoteUI extends Plugin {
  async onload() {
    await this.loadSettings();

    this.isCollapsed = this.settings.isCollapsed || false;
    this.isDragging = false;
    this.dragOffset = { x: 0, y: 0 };

    this.container = document.createElement('div');
    this.container.className = 'overlay-note-ui';
    this.container.style.display = 'none';

    // Register events to update overlay when necessary
    this.registerEvent(this.app.workspace.on('active-leaf-change', () => this.update()));
    this.registerEvent(this.app.workspace.on('layout-change', () => this.update()));
    this.registerEvent(this.app.workspace.on('file-open', () => this.update()));
    this.registerEvent(this.app.metadataCache.on('changed', (file) => {
      const af = this.app.workspace.getActiveFile();
      if (af && file.path === af.path) this.update();
    }));
    this.registerDomEvent(window, 'resize', () => this.update());

    // Drag functionality
    this.registerDomEvent(this.container, 'mousedown', (e) => this.startDrag(e));
    this.registerDomEvent(document, 'mousemove', (e) => this.drag(e));
    this.registerDomEvent(document, 'mouseup', () => this.stopDrag());

    this.addSettingTab(new OverlayNoteUISettingTab(this.app, this));
    this.addCommand({ id: 'refresh-overlay', name: 'Refresh Overlay', callback: () => this.update() });
    this.addCommand({ id: 'toggle-overlay', name: 'Toggle Overlay', callback: () => this.toggle() });
    this.addCommand({
      id: 'set-overlay-menu-for-note',
      name: 'Set overlay menu for this note',
      checkCallback: (checking) => {
        const file = this.app.workspace.getActiveFile();
        if (!file) return false;
        if (!checking) {
          new MenuPickerModal(this.app, this.settings.menus, async (m) => {
            await this.app.fileManager.processFrontMatter(file, (fm) => {
              fm.overlay = true;
              fm.overlayMenu = m.id;
            });
            new Notice(`Overlay menu: ${m.name}`);
            this.update();
          }).open();
        }
        return true;
      }
    });

    this.update();
  }

  onunload() {
    this.container?.remove();
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    this.migrateSettings();
  }
  async saveSettings() { await this.saveData(this.settings); }

  migrateSettings() {
    // Migrate old settings to new menu-based structure
    if (this.settings.layout || this.settings.showByDefault !== undefined) {
      const oldMenu = {
        id: 'migrated',
        name: 'Migrated Menu',
        layout: this.settings.layout || DEFAULT_LAYOUT,
        orientation: 'horizontal',
        position: this.settings.defaultPosition || 'top-right',
        buttonSize: this.settings.buttonSize || 'md',
        toggleButton: this.settings.toggleButton || DEFAULT_MENU.toggleButton
      };
      this.settings.menus = [oldMenu];
      this.settings.defaultMenuId = 'migrated';
      // Remove old properties
      delete this.settings.layout;
      delete this.settings.showByDefault;
      delete this.settings.requireCssClass;
      delete this.settings.defaultPosition;
      delete this.settings.buttonSize;
      delete this.settings.toggleButton;
      this.saveSettings();
    }
    // Ensure menus array exists
    if (!isArray(this.settings.menus)) {
      this.settings.menus = [clone(DEFAULT_SETTINGS.menus[0])];
      this.saveSettings();
    }
    // Ensure all menus have id, name, orientation
    this.settings.menus.forEach((menu, idx) => {
      if (!menu.id) menu.id = `menu-${idx}`;
      if (!menu.name) menu.name = `Menu ${idx + 1}`;
      if (!menu.orientation) menu.orientation = 'horizontal';
    });
    // Ensure defaultMenuId exists
    if (!this.settings.defaultMenuId && this.settings.menus.length > 0) {
      this.settings.defaultMenuId = this.settings.menus[0].id;
      this.saveSettings();
    }
  }

  getActiveMarkdownView() {
    return this.app.workspace.getActiveViewOfType(MarkdownView) || null;
  }


  normalizeButtonsToRows(value) {
    if (!value) return null;
    const toItem = (x) => {
      if (typeof x === 'string') return { type: 'button', id: x };
      if (x && typeof x === 'object') return { type: (x.type ?? 'button'), ...x };
      return null;
    };
    if (isArray(value) && value.length && isArray(value[0])) {
      return value.map((row) => row.map(toItem).filter(Boolean));
    }
    if (isArray(value)) return [value.map(toItem).filter(Boolean)];
    return null;
  }

  chooseMenuForFile(file) {
    const cache = this.app.metadataCache.getFileCache(file) || {};
    const fm = cache.frontmatter || {};

    // 1) Явное определение кнопок в заметке
    const fmRows = this.normalizeButtonsToRows(fm.overlayButtons);
    if (fmRows && fmRows.length) return { layout: fmRows.flat(), menuId: null, source: 'frontmatter:buttons' };

    // 2) Ссылка на пресет по id
    if (typeof fm.overlayMenu === 'string') {
      const preset = this.settings.menus.find(m => m.id === fm.overlayMenu);
      if (preset) return { layout: preset.layout, menuId: preset.id, source: `frontmatter:menu:${preset.id}` };
    }

    // 3) Дефолт
    const preset = this.settings.menus.find(m => m.id === this.settings.defaultMenuId) || this.settings.menus[0];
    return { layout: preset?.layout || [], menuId: preset?.id || null, source: 'default' };
  }

  getConfig(file) {
    const cache = this.app.metadataCache.getFileCache(file) || {};
    const fm = cache.frontmatter || {};

    // Override with frontmatter if specified
    let shouldShow = true; // Menus are enabled by default
    if (typeof fm.overlay === 'boolean') {
      shouldShow = fm.overlay;
    }

    const { layout, menuId } = this.chooseMenuForFile(file);
    const selectedMenu = (menuId
      ? this.settings.menus.find(m => m.id === menuId)
      : this.settings.menus.find(m => m.id === this.settings.defaultMenuId))
      || this.settings.menus[0];

    const position = fm.overlayPosition || selectedMenu?.position || 'top-right';
    const size = selectedMenu?.buttonSize || 'md';

    return { shouldShow, items: layout, position, size, menu: selectedMenu };
  }

  getToggleItems(items, menu) {
    if (this.isCollapsed) {
      return [menu.toggleButton];
    }
    return [menu.toggleButton, ...items];
  }

  toggle() {
    this.isCollapsed = !this.isCollapsed;
    this.settings.isCollapsed = this.isCollapsed;
    this.saveSettings();
    this.update();
  }

  buildButtons(items, orientation) {
    this.container.innerHTML = '';
    const wrap = document.createElement('div');
    wrap.className = 'overlay-note-ui-inner';
    if (orientation === 'vertical') {
      wrap.classList.add('overlay-note-ui-vertical');
    } else {
      wrap.classList.add('overlay-note-ui-horizontal');
    }
    this.container.appendChild(wrap);

    const makeButton = (btn) => {
      const el = document.createElement('button');
      el.className = 'overlay-note-btn';
      if (btn.color) el.style.color = btn.color;
      if (btn.bg) el.style.background = btn.bg;

      let iconName = btn.icon;
      if (btn.id === 'overlay-note-ui:toggle-overlay') {
        iconName = this.isCollapsed ? 'chevron-down' : 'chevron-up';
      }

      if (iconName) {
        const iconSpan = document.createElement('span');
        try { setIcon(iconSpan, iconName); } catch {}
        el.appendChild(iconSpan);
        if (btn.label) el.appendChild(document.createTextNode(' ' + btn.label));
      } else {
        el.textContent = btn.label || btn.id || '…';
      }

      el.addEventListener('click', (evt) => {
        evt.preventDefault();
        evt.stopPropagation();
        if (!btn.id) return;
        if (btn.id === 'overlay-note-ui:toggle-overlay') {
          this.toggle();
          return;
        }
        const ok = this.app.commands.executeCommandById(btn.id);
        if (!ok) {
          new Notice('Command not found: ' + btn.id);
        }
      });
      return el;
    };

    items.forEach(item => {
      if (!item || item.type === 'spacer') {
        wrap.appendChild(Object.assign(document.createElement('div'), { className: 'overlay-spacer' }));
        return;
      }
      wrap.appendChild(makeButton(item));
    });
  }

  applyPosition(pos, size) {
    this.container.classList.remove('pos-top-left', 'pos-top-center', 'pos-top-right', 'pos-bottom-left', 'pos-bottom-center', 'pos-bottom-right', 'pos-left-center', 'pos-right-center', 'pos-free', 'size-sm', 'size-md', 'size-lg');
    // Reset inline styles for non-free positions
    if (pos !== 'free') {
      this.container.style.top = '';
      this.container.style.left = '';
      this.container.style.transform = '';
    }
    switch ((pos || '').toLowerCase()) {
      case 'top-left': this.container.classList.add('pos-top-left'); break;
      case 'top-center': this.container.classList.add('pos-top-center'); break;
      case 'top-right': this.container.classList.add('pos-top-right'); break;
      case 'bottom-left': this.container.classList.add('pos-bottom-left'); break;
      case 'bottom-center': this.container.classList.add('pos-bottom-center'); break;
      case 'bottom-right': this.container.classList.add('pos-bottom-right'); break;
      case 'left-center': this.container.classList.add('pos-left-center'); break;
      case 'right-center': this.container.classList.add('pos-right-center'); break;
      case 'free':
        this.container.classList.add('pos-free');
        this.applyFreePosition();
        break;
      default: this.container.classList.add('pos-top-right'); break;
    }
    this.container.classList.add(`size-${size || 'md'}`);
  }

  update() {
    const view = this.getActiveMarkdownView();
    if (!view || !view.file) {
      this.container.style.display = 'none';
      return;
    }
    if (this.container.parentElement !== view.contentEl) {
      this.container.remove();
      view.contentEl.appendChild(this.container);
    }

    const { shouldShow, items, position, size, menu } = this.getConfig(view.file);
    if (!shouldShow || !menu) {
      this.container.style.display = 'none';
      return;
    }

    this.applyPosition(position, size);
    const displayItems = this.getToggleItems(items, menu);
    this.buildButtons(displayItems, menu.orientation);
    this.container.style.display = 'block';
  }

  applyFreePosition() {
    const file = this.app.workspace.getActiveFile();
    const { menu } = this.getConfig(file);
    if (!file || !menu) return;

    const key = `${file.path}:${menu.id}`;
    const freePos = this.settings.freePositions?.[key] || { top: '0px', left: '0px' };

    // Position relative to toggle button when collapsed, or use saved position when expanded
    if (this.isCollapsed) {
      // When collapsed, position at the toggle button location
      // Use the saved position as the "toggle button" location
      this.container.style.top = freePos.top;
      this.container.style.left = freePos.left;
      this.container.style.transform = 'none';
    } else {
      // When expanded, use the saved free position
      this.container.style.top = freePos.top;
      this.container.style.left = freePos.left;
      this.container.style.transform = 'none';
    }
  }

  startDrag(e) {
    const pos = this.getConfig(this.app.workspace.getActiveFile());
    if (pos.position !== 'free') return;

    this.isDragging = true;
    const rect = this.container.getBoundingClientRect();
    this.dragOffset.x = e.clientX - rect.left;
    this.dragOffset.y = e.clientY - rect.top;
    this.container.style.cursor = 'grabbing';
    e.preventDefault();
  }

  drag(e) {
    if (!this.isDragging) return;

    const view = this.getActiveMarkdownView();
    if (!view) return;

    const viewRect = view.contentEl.getBoundingClientRect();
    let x = e.clientX - viewRect.left - this.dragOffset.x;
    let y = e.clientY - viewRect.top - this.dragOffset.y;

    // Constrain to view bounds
    const containerRect = this.container.getBoundingClientRect();
    x = Math.max(0, Math.min(x, viewRect.width - containerRect.width));
    y = Math.max(0, Math.min(y, viewRect.height - containerRect.height));

    this.container.style.left = x + 'px';
    this.container.style.top = y + 'px';
    this.container.style.transform = 'none';
  }

  stopDrag() {
    if (!this.isDragging) return;

    this.isDragging = false;
    this.container.style.cursor = 'move';

    // Only save position when menu is expanded (not collapsed)
    if (!this.isCollapsed) {
      const file = this.app.workspace.getActiveFile();
      const { menu } = this.getConfig(file);
      if (file && menu) {
        const rect = this.container.getBoundingClientRect();
        const viewRect = this.getActiveMarkdownView().contentEl.getBoundingClientRect();
        const pos = {
          top: (rect.top - viewRect.top) + 'px',
          left: (rect.left - viewRect.left) + 'px'
        };

        // Save to settings
        if (!this.settings.freePositions) this.settings.freePositions = {};
        const key = `${file.path}:${menu.id}`;
        this.settings.freePositions[key] = pos;
        this.saveSettings();
      }
    }
  }
}

module.exports = OverlayNoteUI;
