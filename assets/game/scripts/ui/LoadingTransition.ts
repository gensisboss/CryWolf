import { Node, tween, Vec3 } from 'cc';

export type AsyncLoadingOperation<T> = () => Promise<T>;

export class LoadingTransition {
    private static cloud: Node | null = null;
    private static host: Node | null = null;
    private static travelDistance = 1296;
    private static queue: Promise<void> = Promise.resolve();

    public static configure(cloud: Node, host: Node, travelDistance = 1296): void {
        this.cloud = cloud;
        this.host = host;
        this.travelDistance = travelDistance;
        cloud.active = false;
    }

    public static dispose(cloud?: Node | null): void {
        if (cloud && this.cloud !== cloud) return;
        this.cloud = null;
        this.host = null;
    }

    public static run<T>(operation: AsyncLoadingOperation<T>): Promise<T> {
        const result = this.queue.then(() => this.execute(operation));
        this.queue = result.then(() => undefined, () => undefined);
        return result;
    }

    private static async execute<T>(operation: AsyncLoadingOperation<T>): Promise<T> {
        const cloud = this.cloud;
        const host = this.host;
        if (!cloud?.isValid || !host?.isValid) return operation();

        cloud.active = true;
        cloud.setSiblingIndex(host.children.length - 1);
        cloud.setPosition(-this.travelDistance, 0, 0);
        await this.moveCloud(cloud, Vec3.ZERO, 0.43, 'cubicOut');
        try {
            return await operation();
        } finally {
            if (cloud.isValid) {
                await this.moveCloud(cloud, new Vec3(this.travelDistance, 0, 0), 0.55, 'cubicIn');
                cloud.active = false;
            }
        }
    }

    private static moveCloud(cloud: Node, position: Vec3, duration: number, easing: 'cubicIn' | 'cubicOut'): Promise<void> {
        return new Promise<void>((resolve) => {
            tween(cloud)
                .to(duration, { position }, { easing })
                .call(() => resolve())
                .start();
        });
    }
}
