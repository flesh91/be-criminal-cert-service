import { Constructor, NameAndRegistrationPair, asClass } from '@diia-inhouse/diia-app'

import CriminalRecordCertificateMockProvider from '@src/providers/criminalRecordCertificate/mock'
import CriminalRecordCertificateSevdeirProvider from '@src/providers/criminalRecordCertificate/sevdeir'

import { AppConfig } from '@interfaces/config'
import { CriminalRecordCertificateServiceProvider } from '@interfaces/providers'
import { ProvidersDeps } from '@interfaces/providers/deps'

export function getProvidersDeps(config: AppConfig): NameAndRegistrationPair<ProvidersDeps> {
    const CriminalRecordCertificateProvider: Constructor<CriminalRecordCertificateServiceProvider> = config.sevdeir.isEnabled
        ? CriminalRecordCertificateSevdeirProvider
        : CriminalRecordCertificateMockProvider

    return {
        criminalRecordCertificateProvider: asClass(CriminalRecordCertificateProvider).singleton(),
    }
}
