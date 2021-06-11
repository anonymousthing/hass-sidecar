import { Automation } from "../interfaces/Automation";
import { bound } from "../lib/helpers";

const steps = 5;
const brightnessDelta = Math.floor(256 / steps);

module.exports = class TradfriRemote extends Automation {
    private onPowerButtonToggle = 'automation.tradfri_remote_power_button';
    private onDimUpButtonToggle = 'automation.tradfri_remote_dim_up_button';
    private onDimDownButtonToggle = 'automation.tradfri_remote_dim_down_button';

    private lights = ['light.lynneals_desk', 'light.declans_desk'];

    constructor() {
        super('Tradfri Remote');

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
            const currentBrightness = entity.attributes.brightness;
            this.lightTurnOn(entity.entity_id, { brightness: bound(0, 255, currentBrightness + delta) });
        });
    }
}