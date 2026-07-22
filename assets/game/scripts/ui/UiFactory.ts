import {
    Button,
    Color,
    Graphics,
    HorizontalTextAlignment,
    Label,
    LabelOutline,
    Layers,
    Node,
    Sprite,
    SpriteFrame,
    UITransform,
    Vec3,
    VerticalTextAlignment,
} from 'cc';

export interface PanelStyle {
    fill: Color;
    stroke?: Color;
    lineWidth?: number;
    radius?: number;
}

export function createUiNode(
    parent: Node,
    name: string,
    width: number,
    height: number,
    x = 0,
    y = 0,
): Node {
    const node = new Node(name);
    node.layer = Layers.Enum.UI_2D;
    parent.addChild(node);
    node.setPosition(x, y, 0);
    node.addComponent(UITransform).setContentSize(width, height);
    return node;
}

export function drawPanel(node: Node, width: number, height: number, style: PanelStyle): Graphics {
    const graphics = node.getComponent(Graphics) ?? node.addComponent(Graphics);
    graphics.clear();
    const radius = Math.max(0, Math.min(style.radius ?? 0, width / 2, height / 2));
    graphics.fillColor = style.fill;
    graphics.roundRect(-width / 2, -height / 2, width, height, radius);
    graphics.fill();
    if (style.stroke && (style.lineWidth ?? 0) > 0) {
        graphics.lineWidth = style.lineWidth ?? 1;
        graphics.strokeColor = style.stroke;
        graphics.roundRect(-width / 2, -height / 2, width, height, radius);
        graphics.stroke();
    }
    if (style.fill.a > 40 && width >= 24 && height >= 20) {
        const inset = Math.max(2, Math.min(5, Math.floor(Math.min(width, height) * 0.08)));
        const highlight = new Color(
            Math.min(255, style.fill.r + 34),
            Math.min(255, style.fill.g + 30),
            Math.min(255, style.fill.b + 22),
            Math.min(150, style.fill.a),
        );
        const shade = new Color(
            Math.max(0, style.fill.r - 38),
            Math.max(0, style.fill.g - 34),
            Math.max(0, style.fill.b - 28),
            Math.min(170, style.fill.a),
        );
        graphics.fillColor = highlight;
        graphics.rect(-width / 2 + inset, height / 2 - inset - 2, width - inset * 2, 2);
        graphics.rect(-width / 2 + inset, -height / 2 + inset, 2, height - inset * 2);
        graphics.fill();
        graphics.fillColor = shade;
        graphics.rect(-width / 2 + inset, -height / 2 + inset, width - inset * 2, 3);
        graphics.rect(width / 2 - inset - 3, -height / 2 + inset, 3, height - inset * 2);
        graphics.fill();
    }
    return graphics;
}

export function createPanel(
    parent: Node,
    name: string,
    width: number,
    height: number,
    x: number,
    y: number,
    style: PanelStyle,
): Node {
    const node = createUiNode(parent, name, width, height, x, y);
    drawPanel(node, width, height, style);
    return node;
}

export function createSprite(
    parent: Node,
    name: string,
    frame: SpriteFrame,
    width: number,
    height: number,
    x = 0,
    y = 0,
): Node {
    const node = createUiNode(parent, name, width, height, x, y);
    const sprite = node.addComponent(Sprite);
    sprite.sizeMode = Sprite.SizeMode.CUSTOM;
    sprite.spriteFrame = frame;
    node.getComponent(UITransform)!.setContentSize(width, height);
    return node;
}

export function createCoverSprite(
    parent: Node,
    name: string,
    frame: SpriteFrame,
    viewportWidth: number,
    viewportHeight: number,
): Node {
    const sourceWidth = frame.rect.width || viewportWidth;
    const sourceHeight = frame.rect.height || viewportHeight;
    const scale = Math.max(viewportWidth / sourceWidth, viewportHeight / sourceHeight);
    return createSprite(parent, name, frame, sourceWidth * scale, sourceHeight * scale);
}

export function createLabel(
    parent: Node,
    name: string,
    text: string,
    width: number,
    height: number,
    fontSize: number,
    color: Color,
    x = 0,
    y = 0,
): Label {
    const node = createUiNode(parent, name, width, height, x, y);
    const label = node.addComponent(Label);
    label.string = text;
    label.fontSize = fontSize;
    label.lineHeight = Math.max(fontSize + 4, Math.floor(height / 2));
    label.color = color;
    label.horizontalAlign = HorizontalTextAlignment.CENTER;
    label.verticalAlign = VerticalTextAlignment.CENTER;
    label.overflow = Label.Overflow.SHRINK;
    label.useSystemFont = true;
    label.fontFamily = 'Microsoft YaHei';
    return label;
}

export function bindButton(node: Node, callback: () => void): Button {
    const button = node.addComponent(Button);
    button.transition = Button.Transition.SCALE;
    button.zoomScale = 0.94;
    node.on(Node.EventType.TOUCH_END, callback);
    return button;
}

export function createTextButton(
    parent: Node,
    name: string,
    text: string,
    width: number,
    height: number,
    x: number,
    y: number,
    callback: () => void,
    primary = false,
): Node {
    const node = createPanel(parent, name, width, height, x, y, {
        fill: primary ? new Color(78, 116, 62, 244) : new Color(244, 214, 145, 244),
        stroke: new Color(91, 61, 24, 220),
        lineWidth: 2,
        radius: 6,
    });
    const label = createLabel(
        node,
        `${name}Label`,
        text,
        width - 10,
        height - 4,
        Math.min(18, Math.floor(height * 0.45)),
        primary ? new Color(255, 246, 216) : new Color(78, 52, 23),
    );
    const outline = label.node.addComponent(LabelOutline);
    outline.color = primary ? new Color(37, 54, 29, 230) : new Color(255, 237, 184, 210);
    outline.width = primary ? 2 : 1;
    bindButton(node, callback);
    return node;
}

export function createSpriteButton(
    parent: Node,
    name: string,
    frame: SpriteFrame,
    width: number,
    height: number,
    x: number,
    y: number,
    callback: () => void,
): Node {
    const node = createSprite(parent, name, frame, width, height, x, y);
    bindButton(node, callback);
    return node;
}

export function setNodePosition(node: Node, position: { x: number; y: number }): void {
    node.setPosition(new Vec3(position.x, position.y, 0));
}
