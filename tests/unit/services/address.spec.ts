import { randomUUID } from 'node:crypto'

import { GrpcClientFactory } from '@diia-inhouse/diia-app'

import { mockInstance } from '@diia-inhouse/test'

import AddressService from '@services/address'

import { addressServiceClient } from '@tests/mocks/grpc/clients'

import { AppConfig } from '@interfaces/config'

describe('AddressService', () => {
    const grpcClientFactoryMock = mockInstance(GrpcClientFactory)
    const config = {
        grpc: {
            addressServiceAddress: 'address.service.com',
        },
    }

    jest.spyOn(grpcClientFactoryMock, 'createGrpcClient').mockReturnValueOnce(addressServiceClient)

    const addressService = new AddressService(grpcClientFactoryMock, <AppConfig>config)

    describe('method `getPublicServiceAddress`', () => {
        it('should successfully get public service address', async () => {
            const resourceId = randomUUID()
            const expectedResult = {
                address: {},
            }

            jest.spyOn(addressServiceClient, 'getPublicServiceAddress').mockResolvedValueOnce(expectedResult)

            expect(await addressService.getPublicServiceAddress(resourceId)).toEqual(expectedResult)

            expect(addressServiceClient.getPublicServiceAddress).toHaveBeenCalledWith({ resourceId })
        })
    })
})
