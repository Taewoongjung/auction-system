// 서버가 꺼졌을 때 노드 스케쥴이 동작하지 않는 것들을 보완해주는 부분이다.
const { Op } = require('Sequelize');
const schedule = require('node-schedule');

const { Good, Auction, User, sequelize } = require('./models');

module.exports = async () => {
    console.log('checkAuction');
    try{ // 서버 꺼진 동안 낙찰 되어야할 물건들을 낙찰 시켜주기.
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1); // 어제 시간
        const targets = await Good.findAll({ // 24시간 전에 낙찰받지 못한애들 제일 높은 금액 제시한사람에게 낙찰 처리해주기
            where: {
                SoldId: null,
                createdAt: { [Op.lte]: yesterday },
            },
        });
        targets.forEach(async (target) => {
            const t = await sequelize.transaction();
            try{
                const success = await Auction.findOne({
                    where: { GoodId: target.id },
                    order: [['bid', 'DESC']],
                });
                await Good.update({ SoldId: success.UserId }, { where: { id: target.id }, transaction: t });
                await User.update({
                    money: sequelize.literal(`money - ${success.bid}`),
                }, {
                    where: { id: success.UserId },
                    transaction: t
                });
                await t.commit();
            } catch (error) {
                await t.rollback();
            }
        });
        const unsold = await Good.findAll({  // 서버가 꺼지기 전에도 24시간이 안지나면 다시 서버가 실행되면 스케쥴링 해주기
            where: {
                SoldId: null,
                createdAt: { [Op.gt]: yesterday },
            },
        });
        unsold.forEach((target) => {
            const end = new Date(unsold.createdAt);
            end.setDate(end.getDate() + 1);
            schedule.scheduleJob(end, async () => {
                const success = await Auction.findOne({
                    where: { GoodId: target.id },
                    order: [['bid', 'DESC']],
                });
                await Good.update({ SoldId: success.UserId }, { where: { id: target.id } });
                await User.update({
                    money: sequelize.literal(`money - ${success.bid}`),
                }, {
                    where: { id: success.UserId },
                });
            })
        });
    } catch (error) {
        console.error(error);
    }
};