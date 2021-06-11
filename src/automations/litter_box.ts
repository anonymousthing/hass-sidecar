import { Automation } from "../interfaces/Automation";

module.exports = class LitterBox extends Automation {
    private litterBoxBoolean = 'input_boolean.litter_box';
    private onMotionSensorTrigger = 'automation.tradfri_motion_sensor_1';
    private motionSensorEntity = 'binary_sensor.tradfri_motion_sensor_1';
    private onResetButtonTrigger = 'automation.tradfri_litter_reset';

    private declansPhone = 'mobile_app_galaxy_s10e';
    private lynnsPhone = 'notify.mobile_app_lynn_s_s20_fe';

    constructor() {
        super('Litter Box');

        this.onAutomationTrigger(this.onMotionSensorTrigger, () => {
            this.callService('input_boolean', 'turn_on', this.litterBoxBoolean, {});
            [this.declansPhone, this.lynnsPhone].forEach(d => this.sendPersistentNotification(d));
        });

        this.onAutomationTrigger(this.onResetButtonTrigger, () => {
            this.callService('input_boolean', 'turn_off', this.litterBoxBoolean, {});
            // Reset motion sensor state directly to avoid waiting 1 minute for the auto reset
            this.setState(this.motionSensorEntity, { state: 'off' });
            [this.declansPhone, this.lynnsPhone].forEach(d => this.clearPersistentNotification(d));
        });
    }

    sendPersistentNotification(device: string) {
        this.callService('notify', device, null, {
            title: 'Litter box',
            message: 'Litter box needs to be cleaned',
            data: {
                persistent: true,
                tag: 'litter-box',
            },
        });
    }

    clearPersistentNotification(device: string) {
        this.callService('notify', device, null, {
            message: 'clear_notification',
            data: {
                tag: 'litter-box',
            },
        });
    }
}