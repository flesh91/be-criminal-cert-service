export enum ProcessCode {
    CriminalRecordCertificateHasBeenSent = 26101002,
    CriminalRecordCertificateFailedToSend = 26101003,
    CriminalRecordCertificateServiceUnavailable = 26101004,
    CriminalRecordCertificateSomeRegistryUnavailable = 26101006,
    CriminalRecordCertificateMoreThenOneInProgress = 26101007,
    CriminalRecordCertificateHasBeenSentForDamagedPropertyRecovery = 26101008,
}

export enum IdentityDocumentType {
    InternalPassport = 'internal-passport',
    ForeignPassport = 'foreign-passport',
    ResidencePermitPermanent = 'residence-permit-permanent',
    ResidencePermitTemporary = 'residence-permit-temporary',
}
