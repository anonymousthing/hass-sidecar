import { Automation } from "../interfaces/Automation";
import { bound } from "../lib/helpers";

const steps = 5;
const brightnessDelta = Math.floor(256 / steps);

module.exports = class LanRoomLightControl extends Automation {
    private onPowerButtonToggle = 'automation.lan_room_light_controller_power_button';
    private onDimUpButtonToggle = 'automation.lan_room_light_controller_dim_up_button';
    private onDimDownButtonToggle = 'automation.lan_room_light_controller_dim_down_button';

    private lights = ['light.lan_room_pixar_lamp', 'light.lan_room_terrazzo_lamp'];

    constructor() {
        super('LAN Room Light Controller');

        this.onAutomationTrigger(this.onPowerButtonToggle, async () => {
            const entityStates = await Promise.all(this.lights.map(light => this.getState(light)))
            const stateValues = entityStates.map(entityState => entityState.state);

            if (stateValues.includes('off')) {
                this.lights.forEach(light => this.lightTurnOn(light, {}));
            } else {
                this.lights.forEach(light => this.lightTurnOff(light, {}));
            }
        });
        this.onAutomationTrigger(this.onDimUpButtonToggle, async () => {
            this.onBrightnessChange(brightnessDelta);
        });
        this.onAutomationTrigger(this.onDimDownButtonToggle, async () => {
            this.onBrightnessChange(-brightnessDelta);
        });
    }

    private async onBrightnessChange(delta: number) {
        const entityStates = await Promise.all(this.lights.map(light => this.getState(light)));
        entityStates.forEach(entity => {
            if (entity.attributes.brightness == null) {
                return;
            }
            const currentBrightness = entity.attributes.brightness;
            this.lightTurnOn(entity.entity_id, { brightness: bound(0, 255, currentBrightness + delta) });
        });
    }
}