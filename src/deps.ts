import { DepsFactoryFn, GrpcClientFactory, NameAndRegistrationPair, asClass, asFunction } from '@diia-inhouse/diia-app'

import { AnalyticsService } from '@diia-inhouse/analytics'
import { CryptoDocServiceDefinition, CryptoServiceDefinition } from '@diia-inhouse/diia-crypto-client'
import { PublicServiceCatalogDefinition } from '@diia-inhouse/public-service-catalog-client'

import { getProvidersDeps } from '@src/providers/index'

import { AppConfig } from '@interfaces/config'
import { AppDeps, GrpcClientsDeps } from '@interfaces/deps'

export default async (config: AppConfig): ReturnType<DepsFactoryFn<AppConfig, AppDeps>> => {
    const providersDeps = getProvidersDeps(config)
    const grpcClientsDeps: NameAndRegistrationPair<GrpcClientsDeps> = {
        cryptoServiceClient: asFunction((grpcClientFactory: GrpcClientFactory) =>
            grpcClientFactory.createGrpcClient(CryptoServiceDefinition, config.grpc.cryptoServiceAddress),
        ).singleton(),
        cryptoDocServiceClient: asFunction((grpcClientFactory: GrpcClientFactory) =>
            grpcClientFactory.createGrpcClient(CryptoDocServiceDefinition, config.grpc.cryptoDocServiceAddress),
        ).singleton(),
        publicServiceCatalogClient: asFunction((grpcClientFactory: GrpcClientFactory) =>
            grpcClientFactory.createGrpcClient(PublicServiceCatalogDefinition, config.grpc.publicServiceCatalogAddress),
        ).singleton(),
    }

    return {
        analytics: asClass(AnalyticsService).singleton(),
        ...providersDeps,
        ...grpcClientsDeps,
    }
}
