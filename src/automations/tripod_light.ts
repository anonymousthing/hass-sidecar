import { Automation } from "../interfaces/Automation";

module.exports = class TripodLight extends Automation {
    private litterBoxBoolean = 'input_boolean.litter_box';
    private notificationLight = 'light.lan_room_tripod_lamp';

    constructor() {
        super('Tripod Lamp');

        this.onStateChange(this.litterBoxBoolean, this.onInputChange);
    }

    private onInputChange = async () => {
        const litterBoxState = (await this.getState(this.litterBoxBoolean)).state;
        if (litterBoxState === 'on') {
            this.lightTurnOn(this.notificationLight, { color_name: 'red', brightness: 150 });
            
        } else { // TODO: nightlight
            this.lightTurnOn(this.notificationLight, { rgb_color: [255, 210, 130] });
            this.lightTurnOff(this.notificationLight, {});
        }
    }
}