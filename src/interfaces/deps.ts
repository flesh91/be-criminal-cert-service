import { AnalyticsService } from '@diia-inhouse/analytics'
import { CryptoDocServiceClient, CryptoServiceClient } from '@diia-inhouse/diia-crypto-client'
import { QueueDeps } from '@diia-inhouse/diia-queue'
import { PublicServiceCatalogClient } from '@diia-inhouse/public-service-catalog-client'

export interface GrpcClientsDeps {
    cryptoServiceClient: CryptoServiceClient
    cryptoDocServiceClient: CryptoDocServiceClient
    publicServiceCatalogClient: PublicServiceCatalogClient
}

export type AppDeps = {
    analytics: AnalyticsService
} & Partial<QueueDeps> &
    GrpcClientsDeps
