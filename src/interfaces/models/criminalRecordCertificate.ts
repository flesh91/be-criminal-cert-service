import { Document } from '@diia-inhouse/db'

import { CriminalRecordCertificate } from '@src/generated'

export interface CriminalRecordCertificateModel extends CriminalRecordCertificate, Document {
    createdAt?: Date
    updatedAt?: Date
}
