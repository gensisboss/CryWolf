import { instantiate, Node, Prefab, UITransform } from 'cc';

export class UiScreenManager {
    private current: Node | null = null;

    public constructor(private readonly parent: Node) {}

    public showPrefab(prefab: Prefab, width: number, height: number): Node {
        this.close();
        this.current = instantiate(prefab);
        this.parent.addChild(this.current);
        this.current.setPosition(0, 0, 0);
        const transform = this.current.getComponent(UITransform) ?? this.current.addComponent(UITransform);
        transform.setContentSize(width, height);
        const content = this.current.getChildByName('PrefabContent');
        content?.setScale(1, 1, 1);
        return this.current;
    }

    public close(): void {
        if (this.current?.isValid) {
            this.current.active = false;
            this.current.destroy();
        }
        this.current = null;
    }

    public get currentName(): string | null {
        return this.current?.name ?? null;
    }
}
