import { EventBusListener } from '@diia-inhouse/diia-queue'
import { ValidationSchema } from '@diia-inhouse/validators'

import { ExternalEvent } from '@interfaces/queue'

export default class CriminalRecordCertOrderEventListener implements EventBusListener {
    readonly event: ExternalEvent = ExternalEvent.PublicServiceCriminalRecordCertOrder

    readonly isSync: boolean = true

    readonly validationRules: ValidationSchema = {
        id: { type: 'number' },
        status: { type: 'string' },
    }
}
