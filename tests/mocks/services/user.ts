import { randomUUID } from 'node:crypto'

import { merge } from 'lodash'

import { DocStatus, OwnerType } from '@diia-inhouse/types'
import { UserDocument } from '@diia-inhouse/user-service-client'

export const getTaxpayerCardUserDocument = (data: Partial<UserDocument> = {}): UserDocument => {
    return merge(
        {
            userIdentifier: randomUUID(),
            documentIdentifier: randomUUID(),
            ownerType: OwnerType.owner,
            docStatus: DocStatus.Ok,
            documentType: 'taxpayer-card',
            notifications: {},
        },
        data,
    )
}
