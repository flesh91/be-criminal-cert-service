import { EventBusListener } from '@diia-inhouse/diia-queue'

import CriminalRecordCertificateService from '@services/criminalRecordCertificate'

import { ScheduledTaskEvent } from '@interfaces/queue'

export default class CheckCriminalRecordCertificateApplicationsTask implements EventBusListener {
    constructor(private readonly criminalRecordCertificateService: CriminalRecordCertificateService) {}

    readonly event: ScheduledTaskEvent = ScheduledTaskEvent.CriminalCertCheckCriminalRecordCertificateApplications

    async handler(): Promise<void> {
        await this.criminalRecordCertificateService.prepareTasksToCheckApplicationsStatus()
    }
}
