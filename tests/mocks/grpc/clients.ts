import { GrpcClientFactory } from '@diia-inhouse/diia-app'

import { AddressServiceDefinition } from '@diia-inhouse/address-service-client'
import { AnalyticsServiceDefinition } from '@diia-inhouse/analytics-service-client'
import { CryptoDocServiceDefinition } from '@diia-inhouse/diia-crypto-client'
import DiiaLogger from '@diia-inhouse/diia-logger'
import { MetricsService } from '@diia-inhouse/diia-metrics'
import { DocumentsServiceDefinition } from '@diia-inhouse/documents-service-client'
import { NotificationServiceDefinition } from '@diia-inhouse/notification-service-client'
import { PublicServiceCatalogDefinition } from '@diia-inhouse/public-service-catalog-client'
import { mockInstance } from '@diia-inhouse/test'
import { UserServiceDefinition } from '@diia-inhouse/user-service-client'

const grpcClientFactory = new GrpcClientFactory('CriminalCert', new DiiaLogger(), mockInstance(MetricsService))

export const addressServiceClient = grpcClientFactory.createGrpcClient(AddressServiceDefinition, 'test')

export const analyticsServiceClient = grpcClientFactory.createGrpcClient(AnalyticsServiceDefinition, 'test')

export const cryptoDocServiceClient = grpcClientFactory.createGrpcClient(CryptoDocServiceDefinition, 'test')

export const documentsServiceClient = grpcClientFactory.createGrpcClient(DocumentsServiceDefinition, 'test')

export const notificationServiceClient = grpcClientFactory.createGrpcClient(NotificationServiceDefinition, 'test')

export const publicServiceCatalogClient = grpcClientFactory.createGrpcClient(PublicServiceCatalogDefinition, 'test')

export const userServiceClient = grpcClientFactory.createGrpcClient(UserServiceDefinition, 'test')
