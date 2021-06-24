import { Automation } from "../interfaces/Automation";

const REMINDER_INTERVAL = 1_800_000;

module.exports = class LitterBox extends Automation {
    private reminderHandle: NodeJS.Timeout | undefined;

    private litterBoxBoolean = 'input_boolean.litter_box';
    private onMotionSensorTrigger = 'automation.litter_box_motion_sensor';
    private motionSensorEntity = 'binary_sensor.litter_box_motion_sensor';
    private onResetButtonTrigger = 'automation.litter_box_reset_button';

    private declansPhone = 'mobile_app_s21';
    private lynnsPhone = 'mobile_app_lynn_s_s20_fe';

    constructor() {
        super('Litter Box');

        this.onAutomationTrigger(this.onMotionSensorTrigger, () => {
            this.callService('input_boolean', 'turn_on', this.litterBoxBoolean, {});
        });
        this.onAutomationTrigger(this.onResetButtonTrigger, () => {
            this.callService('input_boolean', 'turn_off', this.litterBoxBoolean, {});
            // Reset motion sensor state directly to avoid waiting 1 minute for the auto reset
            // Do it after 3 seconds, to avoid retriggering immediately due to human presence
            setTimeout(() => this.setState(this.motionSensorEntity, { state: 'off' }, ), 3000);
        });

        this.onStateChange(this.litterBoxBoolean, this.onLitterBoxChange);
    }

    private onLitterBoxChange = async () => {
        const litterBoxState = (await this.getState(this.litterBoxBoolean)).state;
        if (litterBoxState === 'on') {
            const sendNotifications = () => [this.declansPhone, this.lynnsPhone].forEach(d => this.sendPersistentNotification(d));
            sendNotifications();
            this.reminderHandle = setInterval(sendNotifications, REMINDER_INTERVAL);
        } else {
            [this.declansPhone, this.lynnsPhone].forEach(d => this.clearPersistentNotification(d));
            this.reminderHandle && clearInterval(this.reminderHandle);
        }
    }

    private sendPersistentNotification(device: string) {
        this.callService('notify', device, null, {
            title: 'Litter box',
            message: 'Litter box needs to be cleaned',
            data: {
                persistent: true,
                tag: 'litter-box',
            },
        });
    }

    private clearPersistentNotification(device: string) {
        this.callService('notify', device, null, {
            message: 'clear_notification',
            data: {
                tag: 'litter-box',
            },
        });
    }
}