# Board UI Kit — плагин для Figma

## Установка (один раз)
1. Открой Figma Desktop и любой файл.
2. Меню Plugins → Development → Import plugin from manifest…
3. Выбери `manifest.json` из этой папки.

## Запуск
Plugins → Development → Board UI Kit.

Плагин собирает две страницы:
- «UI Kit» — очищается и собирается заново при каждом запуске;
- «User Flow» — AS IS (4 экрана Оповещатора) и TO BE (3 экрана на компонентах кита).
  Если в файле уже есть «User Flow», сделанная не плагином, она не удаляется, а переименовывается в «User Flow (старый)».
Остальные страницы не трогает. Стили цветов и текста обновляются по именам, без дублей.

## Что внутри
- Стили цветов: Accent, Neutral, UI, Text, Canvas, Sticker.
- Текстовые стили: Heading (Display, H1, H2), Body, Caption, Label, Tag, Button.
- Компоненты участников: Cursor (5 цветов × 3 заливки), Tag (свойство Name), Collaborator (курсор + тег).
- Button (5 видов × S/M/L × Default/Hover/Disabled, свойство Label), Canvas (Miro — сетка, Holst — точки).
- Инструменты доски: Toolbar, Tool Button (свойство Icon), Tooltip, 52 иконки 24 px.
- Стикеры: Sticker (12 цветов, свойство Text), Sticker Picker.
- Текст: Text Box (пустой / заполненный / выделенный), Text Toolbar.
- Фреймы: Frame Menu (Произвольный, 16:9, 4:3, 1:1, A4), Board Frame.
- Рисование: Draw Menu, Draw Settings (толщина и палитра).
- Реакции: Reaction (8 видов), Reaction Picker.
- Toggle (On / Off) и Badge (4 цвета, свойство Label).
- Экран доски: Board Header (свойство Board Name), Board Toolbar, Timer (свойство Time), Zoom Control (свойство Zoom), Board Menu, Grid Menu и два макета 1920×1080: на точках (Holst) и с открытым меню на сетке (Miro).

## Шрифт
Нужен VTB Group UI (Book, Medium, Semi Bold), установленный на компьютере или загруженный в аккаунт Figma.
Если его нет, плагин соберёт кит на Inter.
