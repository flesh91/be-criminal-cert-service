import { GrpcAppAction } from '@diia-inhouse/diia-app'

import { ActionVersion, SessionType } from '@diia-inhouse/types'
import { ValidationSchema } from '@diia-inhouse/validators'

import { getSendCriminalRecordCertificateApplicationDataValidationSchema } from '@src/validation/criminalRecordCertificate'

import CriminalRecordCertificateService from '@services/criminalRecordCertificate'

import { ActionResult, CustomActionArguments } from '@interfaces/actions/v1/sendCriminalRecordCertificateApplicationConfirmation'

export default class SendCriminalRecordCertificateApplicationConfirmationAction implements GrpcAppAction {
    constructor(private readonly criminalRecordCertificateService: CriminalRecordCertificateService) {
        this.validationRules = getSendCriminalRecordCertificateApplicationDataValidationSchema([
            ...this.criminalRecordCertificateService.reasons.keys(),
        ])
    }

    readonly sessionType: SessionType = SessionType.User

    readonly actionVersion: ActionVersion = ActionVersion.V1

    readonly name: string = 'sendCriminalRecordCertificateApplicationConfirmation'

    readonly validationRules: ValidationSchema

    async handler(args: CustomActionArguments): Promise<ActionResult> {
        const {
            session: { user },
            params,
        } = args

        this.criminalRecordCertificateService.checkSendApplicationDataParams(params)

        return await this.criminalRecordCertificateService.sendApplicationConfirmation(user, params)
    }
}
